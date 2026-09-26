import { describe, expect, it } from 'vitest';
import {
	LANE_PAGES,
	TEMPO_SCALINGS,
	ccToLane,
	ccToTempo,
	describeCc,
	encodeCcValue,
	formatLane,
	laneToCc,
	listGlobalCcs,
	listTrackCcs,
	parseLane,
	resolveCc,
	tempoToCc,
	type CcTarget
} from './ccmap';
import { CC_TRACK_TYPES } from './ccMap.schema';
import { ccMapFile, changelogFile } from './data';
import { CcMapError } from './errors';

const params = (targets: readonly CcTarget[]) => targets.map((t) => t.param);

describe('resolveCc: per-track parameters', () => {
	it('resolves filter cutoff on track 3 to CC32 on channel 3 (wire channel 2)', () => {
		const target = resolveCc({ track: 3, param: 'filter.cutoff' });
		expect(target).toMatchObject({
			cc: 32,
			channel: 2,
			acceptedChannels: [2],
			scope: 'track',
			track: 3,
			param: 'filter.cutoff',
			name: 'filter cutoff',
			lane: { module: 3, layer: 'base', encoder: 1 },
			range: [0, 127],
			mapping: { kind: 'continuous' },
			confidence: 'community-verified',
			since: null
		});
		expect(target.risk).toMatchObject({ level: 'state', confirm: false, persistent: true });
		expect(target.source.length).toBeGreaterThan(0);
	});

	it('accepts the full cc-map.json ids', () => {
		expect(resolveCc({ track: 3, param: 'track.filter.cutoff' }).param).toBe('filter.cutoff');
		expect(resolveCc({ track: 14, param: 'tape.pitch' })).toMatchObject({ cc: 12, param: 'pitch' });
	});

	it.each([
		[1, 'level', 7],
		[5, 'mute', 9],
		[9, 'pan', 10],
		[1, 'engine.p1', 12],
		[8, 'ampEnv.release', 23],
		[2, 'filterEnv.attack', 24],
		[3, 'voice.playMode', 28],
		[3, 'voice.bendRange', 30],
		[4, 'send.fx2', 39],
		[6, 'lfo.k3', 42],
		[9, 'link', 15],
		[11, 'channel', 12],
		[11, 'slot8.number', 39],
		[13, 'source', 12],
		[13, 'send.tape', 37],
		[14, 'length', 14],
		[16, 'lp', 35]
	])('track %i %s → CC%i', (track, param, cc) => {
		const target = resolveCc({ track, param });
		expect(target.cc).toBe(cc);
		expect(target.channel).toBe(track - 1);
	});

	it('maps mute as a toggle and pan around its centre', () => {
		const mute = resolveCc({ track: 2, param: 'mute' });
		expect(mute.mapping).toEqual({ kind: 'toggle', off: 0, on: 127, onFrom: 1 });
		expect(encodeCcValue(mute, true)).toBe(127);
		expect(encodeCcValue(mute, false)).toBe(0);
		expect(encodeCcValue(mute, 1)).toBe(1);
		expect(mute.risk.persistent).toBe(true);
		expect(resolveCc({ track: 2, param: 'pan' }).mapping).toEqual({ kind: 'centered', center: 64 });
	});

	it('resolves engine parameter names when the engine is known', () => {
		expect(resolveCc({ track: 3, param: 'engine.shape', engine: 'prism' })).toMatchObject({
			cc: 12,
			param: 'engine.p1',
			name: 'prism: shape'
		});
		expect(resolveCc({ track: 7, param: 'engine.tremolo', engine: 'axis' }).cc).toBe(15);
		expect(resolveCc({ track: 1, param: 'engine.sampleEnd', engine: 'drum' }).cc).toBe(14);
		expect(resolveCc({ track: 5, param: 'engine.p2', engine: 'dissolve' }).name).toBe(
			'dissolve: am'
		);
		expect(resolveCc({ track: 5, param: 'engine.p4', engine: 'midi' }).name).toBe('engine param 4');
	});

	it('rejects engine names without an engine, on aux tracks, or unknown to the engine', () => {
		expect(() => resolveCc({ track: 3, param: 'engine.shape' })).toThrow(
			/needs the track's engine/
		);
		expect(() => resolveCc({ track: 9, param: 'engine.shape', engine: 'prism' })).toThrow(
			/instrument tracks 1-8/
		);
		expect(() => resolveCc({ track: 3, param: 'engine.swarm', engine: 'prism' })).toThrow(
			/prism has no parameter "swarm"/
		);
		expect(() => resolveCc({ track: 3, param: 'engine.shape', engine: 'nope' })).toThrow(
			/unknown engine/
		);
	});

	it('resolves effect names on FX I / FX II', () => {
		expect(resolveCc({ track: 16, param: 'effect.size', effect: 'reverb' })).toMatchObject({
			cc: 12,
			channel: 15,
			name: 'reverb: size'
		});
		expect(resolveCc({ track: 15, param: 'effect.lowCut', effect: 'distortion' }).cc).toBe(14);
		expect(resolveCc({ track: 15, param: 'p4', effect: 'delay' }).name).toBe('delay: dry');
		expect(() => resolveCc({ track: 15, param: 'effect.size' })).toThrow(
			/needs the track's effect/
		);
		expect(() => resolveCc({ track: 3, param: 'effect.size', effect: 'reverb' })).toThrow(
			/FX tracks/
		);
		expect(() => resolveCc({ track: 15, param: 'effect.warp', effect: 'reverb' })).toThrow(
			/reverb has no parameter/
		);
	});

	it('keeps the FX I → FX II send on track 15 only', () => {
		expect(resolveCc({ track: 15, param: 'sendToFx2' })).toMatchObject({ cc: 39, channel: 14 });
		expect(() => resolveCc({ track: 16, param: 'sendToFx2' })).toThrow(/only exists on track 15/);
		expect(params(listTrackCcs(15))).toContain('sendToFx2');
		expect(params(listTrackCcs(16))).not.toContain('sendToFx2');
	});

	it('adds derived LFO lanes to auxiliary tracks with an LFO page', () => {
		const lfo = resolveCc({ track: 13, param: 'lfo.k1' });
		expect(lfo).toMatchObject({ cc: 40, confidence: 'derived', lane: { module: 4, encoder: 1 } });
		expect(() => resolveCc({ track: 12, param: 'lfo.k1' })).toThrow(CcMapError);
		expect(params(listTrackCcs(10))).toEqual([
			'level',
			'mute',
			'pan',
			'parameters',
			'lfo.k1',
			'lfo.k2'
		]);
	});

	it('lists every documented CC of a track', () => {
		expect(listTrackCcs(1)).toHaveLength(4 + 32);
		expect(listTrackCcs(14).map((t) => t.cc)).toEqual([
			7, 9, 10, 46, 12, 13, 14, 15, 32, 35, 38, 39, 40, 41, 42, 43
		]);
	});

	it('explains what it does not know', () => {
		expect(() => resolveCc({ track: 3, param: 'filter.type' })).toThrow(
			/track 3 \(track 3\) has no parameter "filter.type"; known: level, mute/
		);
		expect(() => resolveCc({ track: 17, param: 'level' })).toThrow(/track must be an integer 1-16/);
	});
});

describe('resolveCc: lanes', () => {
	it('returns the documented parameter on a lane', () => {
		expect(resolveCc({ track: 14, lane: 'M1.light' })).toMatchObject({
			cc: 14,
			param: 'length',
			confidence: 'conflicting'
		});
		expect(resolveCc({ track: 3, lane: { module: 4, layer: 'base', encoder: 2 } }).param).toBe(
			'lfo.k2'
		);
		expect(resolveCc({ track: 3, lane: 'M1+shift.dark' })).toMatchObject({
			cc: 16,
			param: 'engine.p5',
			confidence: 'speculative'
		});
		expect(resolveCc({ track: 12, lane: 'M3.dark' }).param).toBe('hp');
	});

	it('predicts undocumented lanes from the lane model, tagged speculative', () => {
		expect(resolveCc({ track: 12, lane: 'M1.dark' })).toMatchObject({
			cc: 12,
			channel: 11,
			param: 'lane.M1.dark',
			confidence: 'speculative',
			lane: { module: 1, layer: 'base', encoder: 1 }
		});
		expect(resolveCc({ track: 11, lane: 'M2alt.white' }).cc).toBe(27);
	});
});

describe('lane model', () => {
	it('has eight pages of four consecutive CCs from CC12 to CC43', () => {
		expect(LANE_PAGES).toHaveLength(8);
		expect(LANE_PAGES.flatMap((p) => p.ccs)).toEqual(Array.from({ length: 32 }, (_, i) => 12 + i));
		expect(LANE_PAGES.map((p) => `M${p.module}:${p.layer}`)).toEqual([
			'M1:base',
			'M1:shift',
			'M2:base',
			'M2:alt',
			'M2:shift',
			'M3:base',
			'M3:shift',
			'M4:base'
		]);
	});

	it('tags each page with its confidence (M1 + shift speculative, M4 derived)', () => {
		const confidence = (module: number, layer: string) =>
			LANE_PAGES.find((p) => p.module === module && p.layer === layer)?.confidence;
		expect(confidence(1, 'shift')).toBe('speculative');
		expect(confidence(4, 'base')).toBe('derived');
		expect(confidence(3, 'base')).toBe('community-verified');
		expect(ccMapFile.laneModel.confidence).toBe('derived');
	});

	it('agrees with the lane of every parameter in cc-map.json', () => {
		const entries = [
			...ccMapFile.perTrack,
			...CC_TRACK_TYPES.flatMap((type) => ccMapFile.trackTypes[type].params)
		];
		let checked = 0;
		for (const entry of entries) {
			if (!entry.lane || entry.lane === 'mixer') continue;
			expect(laneToCc(entry.lane).cc, `${entry.id} on ${entry.lane}`).toBe(entry.cc);
			expect(formatLane(parseLane(entry.lane))).toBe(entry.lane);
			checked++;
		}
		expect(checked).toBeGreaterThan(60);
		expect(ccMapFile.laneModel.mixer).toEqual({ level: 7, pan: 10, mute: 9 });
	});

	it('converts between lanes and CCs', () => {
		expect(laneToCc('M2alt.white')).toEqual({ cc: 27, confidence: 'community-verified' });
		expect(ccToLane(36)).toEqual({ module: 3, layer: 'shift', encoder: 1 });
		expect(ccToLane(7)).toBeUndefined();
		expect(ccToLane(44)).toBeUndefined();
		expect(() => parseLane('M4+shift.dark')).toThrow(/no page M4 shift/);
		expect(() => parseLane('M3alt.dark')).toThrow(/no page M3 alt/);
		expect(() => parseLane('M5.dark')).toThrow(/invalid lane/);
		expect(() => laneToCc({ module: 1, layer: 'alt', encoder: 1 })).toThrow(CcMapError);
	});
});

describe('resolveCc: global parameters', () => {
	it('covers tempo, groove, scenes, project, EQ, track select, transport and remote keys', () => {
		expect(listGlobalCcs().map((t) => [t.param, t.cc])).toEqual([
			['global.tempo', 80],
			['global.groove', 81],
			['scene.selectDelayed', 82],
			['scene.previous', 83],
			['scene.next', 84],
			['scene.select', 85],
			['project.load', 86],
			['master.eq.low', 90],
			['master.eq.mid', 90],
			['master.eq.high', 90],
			['master.eq.blend', 90],
			['track.select', 102],
			['transport.playCc', 104],
			['transport.stopCc', 105],
			['ui.keyDown', 106],
			['ui.keyUp', 107]
		]);
		expect(listGlobalCcs().every((t) => t.scope === 'global' && t.track === null)).toBe(true);
	});

	it('sends tempo on any channel with the scaling verified on the device', () => {
		const tempo = resolveCc({ param: 'global.tempo' });
		expect(tempo).toMatchObject({
			cc: 80,
			channel: 0,
			acceptedChannels: 'any',
			confidence: 'verified',
			mapping: { kind: 'tempo', scalings: ['bpm-over-2'] }
		});
		expect(encodeCcValue(tempo, 120)).toBe(60);
		expect(() => encodeCcValue(tempo, 'fast')).toThrow(/BPM number/);
		expect(resolveCc({ param: 'global.groove' }).mapping).toEqual({ kind: 'centered', center: 63 });
	});

	it('numbers scenes from 1 and knows CC82 arrived in OS 1.1.0', () => {
		const scene = resolveCc({ param: 'scene.select' });
		expect(scene.mapping).toEqual({ kind: 'index', first: 1, count: 99 });
		expect(encodeCcValue(scene, 1)).toBe(0);
		expect(encodeCcValue(scene, 99)).toBe(98);
		expect(() => encodeCcValue(scene, 0)).toThrow(CcMapError);
		expect(() => encodeCcValue(scene, 100)).toThrow(CcMapError);
		expect(scene.risk.minIntervalMs).toBe(250);
		const delayed = resolveCc({ param: 'scene.selectDelayed' });
		expect(delayed.since).toBe('1.1.0');
		expect(changelogFile.items.some((i) => i.version === '1.1.0' && i.area === 'midi-cc')).toBe(
			true
		);
		expect(encodeCcValue(resolveCc({ param: 'scene.next' }))).toBe(127);
	});

	it('makes project load (CC86) a confirmed, rate-limited, destructive action', () => {
		const load = resolveCc({ param: 'project.load' });
		expect(load.cc).toBe(86);
		expect(load.risk).toEqual({
			level: 'destructive',
			confirm: true,
			minIntervalMs: 5000,
			persistent: true,
			reason: expect.stringMatching(/1\.0\.40/)
		});
		expect(encodeCcValue(load, 0)).toBe(0);
		expect(encodeCcValue(load, 127)).toBe(127);
	});

	it('selects the master EQ band by channel, flagging the disputed blend band', () => {
		const bands = ['low', 'mid', 'high', 'blend'].map((b) =>
			resolveCc({ param: `master.eq.${b}` })
		);
		expect(bands.map((b) => b.channel)).toEqual([0, 1, 2, 3]);
		expect(bands.map((b) => b.acceptedChannels)).toEqual([[0], [1], [2], [3]]);
		expect(bands[3].confidence).toBe('conflicting');
		expect(bands[0].confidence).toBe('community-verified');
		expect(() => resolveCc({ param: 'master.eq' })).toThrow(/unknown global parameter/);
	});

	it('keeps track select and remote keys on channel 1', () => {
		const select = resolveCc({ param: 'track.select' });
		expect(select).toMatchObject({
			channel: 0,
			acceptedChannels: [0],
			mapping: { kind: 'index', first: 1, count: 16 }
		});
		expect(encodeCcValue(select, 16)).toBe(15);
		const down = resolveCc({ param: 'ui.keyDown' });
		expect(down.risk).toMatchObject({ level: 'destructive', confirm: true, minIntervalMs: 50 });
		expect(encodeCcValue(down, 71)).toBe(71);
		expect(resolveCc({ param: 'ui.keyUp' }).risk.level).toBe('ui');
	});
});

describe('risk', () => {
	const everything = [
		...listGlobalCcs(),
		...Array.from({ length: 16 }, (_, i) => listTrackCcs(i + 1)).flat()
	];

	it('gives every target a policy: destructive ⇒ confirm, state ⇒ persistent', () => {
		for (const target of everything) {
			if (target.risk.level === 'destructive') expect(target.risk.confirm, target.param).toBe(true);
			if (target.risk.level === 'state') expect(target.risk.persistent, target.param).toBe(true);
			expect(target.risk.minIntervalMs).toBeGreaterThanOrEqual(0);
		}
		const levels = new Set(everything.map((t) => t.risk.level));
		expect(levels).toEqual(new Set(['state', 'destructive', 'ui', 'transport']));
	});

	it('only asks for confirmation where data can be lost or any key pressed', () => {
		expect(everything.filter((t) => t.risk.confirm).map((t) => t.param)).toEqual([
			'project.load',
			'ui.keyDown'
		]);
	});
});

describe('describeCc', () => {
	it('labels traffic by CC and channel', () => {
		expect(params(describeCc(32, 2))).toEqual(['filter.cutoff']);
		expect(describeCc(32, 2)[0].track).toBe(3);
		expect(params(describeCc(80, 9))).toEqual(['global.tempo']);
		expect(params(describeCc(90, 1))).toEqual(['master.eq.mid']);
		expect(describeCc(90, 5)).toEqual([]);
		expect(params(describeCc(106, 0))).toEqual(['ui.keyDown']);
		expect(params(describeCc(106, 4))).toEqual([]);
		expect(params(describeCc(12, 13))).toEqual(['pitch']);
	});
});

describe('values', () => {
	it('validates raw values instead of clamping', () => {
		const cutoff = resolveCc({ track: 1, param: 'filter.cutoff' });
		expect(encodeCcValue(cutoff, 0)).toBe(0);
		expect(encodeCcValue(cutoff, 127)).toBe(127);
		for (const bad of [-1, 128, 1.5]) expect(() => encodeCcValue(cutoff, bad)).toThrow(CcMapError);
		expect(() => encodeCcValue(cutoff, 'high')).toThrow(/expected a number/);
		expect(() => encodeCcValue(resolveCc({ track: 1, param: 'mute' }), 'on')).toThrow(
			/true\/false/
		);
		expect(() => encodeCcValue(resolveCc({ param: 'scene.select' }), 'one')).toThrow(
			/integer 1-99/
		);
	});

	it('refuses enum values while bucket thresholds are unknown, unless told to assume even buckets', () => {
		const playMode = resolveCc({ track: 3, param: 'voice.playMode' });
		expect(playMode.mapping).toEqual({
			kind: 'enum',
			values: ['poly', 'mono', 'legato'],
			thresholds: null
		});
		expect(() => encodeCcValue(playMode, 'mono')).toThrow(/thresholds are unknown/);
		const even = { assumeEvenBuckets: true };
		expect(['poly', 'mono', 'legato'].map((v) => encodeCcValue(playMode, v, even))).toEqual([
			21, 64, 106
		]);
		expect(() => encodeCcValue(playMode, 'unison', even)).toThrow(/one of poly, mono, legato/);
		const bend = resolveCc({ track: 3, param: 'voice.bendRange' });
		expect(bend.mapping.kind === 'enum' && bend.mapping.values).toHaveLength(9);
		const channel = resolveCc({ track: 11, param: 'channel' });
		expect(encodeCcValue(channel, '16', even)).toBe(124);
		expect(resolveCc({ track: 13, param: 'source' }).mapping).toMatchObject({
			values: ['mic', 'headset', 'line', 'usb', 'main']
		});
	});

	it('converts tempo under both proposed CC80 scalings', () => {
		expect([...TEMPO_SCALINGS]).toEqual(
			ccMapFile.global.find((g) => g.cc === 80)?.candidates?.map((c) => c.id)
		);
		expect(tempoToCc(40, 'linear-40-220')).toBe(0);
		expect(tempoToCc(220, 'linear-40-220')).toBe(127);
		expect(tempoToCc(120, 'linear-40-220')).toBe(56);
		expect(ccToTempo(127, 'linear-40-220')).toBe(220);
		expect(tempoToCc(120, 'bpm-over-2')).toBe(60);
		expect(ccToTempo(60, 'bpm-over-2')).toBe(120);
		expect(() => tempoToCc(30, 'linear-40-220')).toThrow(/40-220/);
		expect(() => tempoToCc(300, 'bpm-over-2')).toThrow(/40-220/);
		// verified on OS 1.1.33: BPM = 2 × value, clamped to 40–220 (docs/research/90-device-probe.md)
		expect([0, 32, 60, 64, 96, 127].map((v) => ccToTempo(v))).toEqual([40, 64, 120, 128, 192, 220]);
		expect(tempoToCc(128)).toBe(64);
		expect(tempoToCc(121)).toBe(61);
		expect(() => tempoToCc(39)).toThrow(/40-220/);
		expect(() => tempoToCc(NaN, 'bpm-over-2')).toThrow(CcMapError);
		expect(() => ccToTempo(128, 'bpm-over-2')).toThrow(CcMapError);
	});
});
