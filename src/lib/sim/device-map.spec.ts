// The device map (Phase F4, with F3's screen descriptions): built from the simulator, so the
// committed file must be what the simulator gives now; every path leads where the map says; the
// pages cover what the plan lists; what the device's own screens showed (research 59) holds in
// it; and what it says MIDI reaches agrees with the CC map. Only the first test builds the map
// (a few seconds of turning every encoder); the others read the committed file it pins.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ccMapJson from '$knowledge/midi/cc-map.json';
import { ENGINE_IDS, tryParseKeys } from '$lib/core/opxy';
import {
	DEVICE_MAP_FILE,
	buildDeviceMap,
	formatDeviceMap,
	midiReach,
	playPath,
	type DeviceMap,
	type MapControl,
	type MapPage,
	type ReachKind
} from './device-map';
import { buildFrame } from './frames';
import { OpxySim } from './opxy-sim.svelte';
import { LFO_TYPES } from './params';
import { describeFrame } from './screen/render';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('the device map', () => {
	const committed = readFileSync(`${ROOT}${DEVICE_MAP_FILE}`, 'utf8');
	const map = JSON.parse(committed) as DeviceMap;
	const page = (id: string): MapPage => {
		const found = map.pages.find((p) => p.id === id);
		if (!found) throw new Error(`the map has no page ${id}`);
		return found;
	};
	const control = (id: string, keys: string): MapControl => {
		const found = page(id).controls.find((c) => c.keys === keys);
		if (!found) throw new Error(`${id} has no control ${keys}`);
		return found;
	};
	const range = (id: string, keys: string) => control(id, keys).range;
	const values = (id: string, keys: string) => range(id, keys)?.values;
	const labels = (id: string, layer: string) =>
		page(id)
			.controls.filter((c) => c.layer === layer)
			.map((c) => c.label);

	it('matches the committed map (run node scripts/build-device-map.mjs after changing the simulator)', () => {
		expect(formatDeviceMap(buildDeviceMap())).toBe(committed);
	}, 60_000);

	it('covers every engine, LFO type and auxiliary track, the mixer, tempo, the players, project and COM', () => {
		const ids = map.pages.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const engine of ENGINE_IDS) expect(ids).toContain(`instrument.m1.${engine}`);
		for (const type of LFO_TYPES) expect(ids).toContain(`instrument.m4.${type}`);
		expect(ids).toEqual(
			expect.arrayContaining([
				'instrument.m2',
				'instrument.m3',
				'instrument.presets',
				'instrument.filter-types',
				'instrument.lfo-types',
				'mix.m1',
				'mix.m2',
				'mix.m3',
				'mix.m4',
				'tempo',
				'player.arpeggio',
				'project',
				'com'
			])
		);
		for (let track = 9; track <= 16; track++) {
			expect(ids.filter((id) => page(id).track === track).length, `track ${track}`).toBeGreaterThan(
				0
			);
		}
		expect(map.firmware).toBe('1.1.33');
	});

	it('gets to every page from a new project by the keys it gives, in the key grammar', () => {
		for (const p of map.pages) {
			const sim = new OpxySim({ now: () => 0 });
			playPath(sim, p.path);
			expect(describeFrame(buildFrame(sim.state)), p.id).toBe(p.screen);
			for (const step of p.path) expect(tryParseKeys(step.keys).ok, step.keys).toBe(true);
			for (const c of p.controls) expect(tryParseKeys(c.keys).ok, c.keys).toBe(true);
		}
		// a page a new project opens on needs no keys; the player list keeps shift held
		expect(page('instrument.m1.drum').path).toEqual([]);
		expect(page('player.hold').path.map((s) => s.keys)).toContain('shift + player → + player');
	});

	it('gives every turn a label and its range, and every click what it does', () => {
		for (const p of map.pages) {
			for (const c of p.controls) {
				if (c.layer === 'click' || c.layer === 'shift-click') {
					expect(c.does, `${p.id} ${c.keys}`).toBeTruthy();
					continue;
				}
				expect(c.label, `${p.id} ${c.keys}`).toBeTruthy();
				expect(c.range?.detents, `${p.id} ${c.keys}`).toBeGreaterThan(0);
			}
		}
		const controls = map.pages.reduce((n, p) => n + p.controls.length, 0);
		expect(controls).toBeGreaterThan(300);
	});

	it('names what plan_steps takes where it can set the value, tried on the simulator', () => {
		expect(control('instrument.m3', 'turn E1').param).toBe('filter.cutoff');
		expect(control('instrument.m2', 'shift + turn E2').param).toBe('playMode.portamento');
		expect(control('instrument.m1.prism', 'turn E2').param).toBe('m1.2');
		expect(control('tempo', 'turn E1').param).toBe('tempo.bpm');
		expect(control('auxiliary.fx-ii.m1', 'turn E1').param).toBe('size');
		expect(control('mix.m1', 'turn E4').param).toBe('level');
		// the sampler keys' own settings are not the navigator's yet
		expect(control('instrument.m1.drum', 'turn E1').param).toBeUndefined();
	});

	it('links the pages to our manual', () => {
		expect(page('instrument.m3').units).toEqual(['instrument.filter', 'instrument.track-sends']);
		expect(control('instrument.m3', 'turn E1').about).toMatch(/frequency/);
		expect(control('mix.m1', 'click E4')).toMatchObject({ label: 'mute', does: 'muted' });
	});

	describe('agrees with what the device’s screens showed (research 59)', () => {
		it('§2.2 envelopes: two of them a click apart; the play mode layer', () => {
			expect(page('instrument.m2').screen).toMatch(/^amp envelope: /);
			expect(page('instrument.m2').altScreen).toMatch(/^filter envelope: /);
			expect(control('instrument.m2', 'click E1').does).toBe('amp envelope → filter envelope');
			expect(values('instrument.m2', 'shift + turn E1')).toEqual(['poly', 'mono', 'legato']);
			expect(range('instrument.m2', 'shift + turn E2')?.shows?.[0]).toEqual({
				from: '00',
				to: '00',
				shows: 'off'
			});
			expect(range('instrument.m2', 'shift + turn E3')?.shows?.at(-1)?.shows).toBe('octave');
		});

		it('§2.3 filter: the types in the list’s order, no negative envelope amount, the sends', () => {
			expect(values('instrument.filter-types', 'turn E1')).toEqual([
				'ladder',
				'svf',
				'z hipass',
				'z lowpass'
			]);
			expect(control('instrument.filter-types', 'click E1').does).toMatch(/^opens prism: /);
			expect(range('instrument.m3', 'turn E3')).toMatchObject({ first: '00', last: '99' });
			expect(labels('instrument.m3', 'shift')).toEqual(['aux out', 'tape', 'fx I', 'fx II']);
		});

		it('§2.4 LFOs: value’s six destinations, element’s four, duck’s tracks then the metronome', () => {
			expect(values('instrument.m4.value', 'turn E3')).toEqual([
				'syn',
				'syn free',
				'env',
				'env free',
				'filter',
				'filter free'
			]);
			expect(values('instrument.m4.element', 'turn E3')).toEqual(['syn', 'env', 'filter', 'amp']);
			expect(range('instrument.m4.duck', 'turn E1')).toMatchObject({
				first: '1',
				last: 'metronome'
			});
			expect(page('instrument.m4.tremolo').note).toMatch(/^off in a new project: M4/);
		});

		it('§2.5 engines: prism’s ten ratios, wavetable’s tables, the drum key’s tune and play modes', () => {
			expect(range('instrument.m1.prism', 'turn E2')?.shows?.map((s) => s.shows)).toEqual([
				'2:1',
				'1:1',
				'2:3',
				'1:2',
				'1:3',
				'1:4',
				'1:6',
				'1:8',
				'1:12',
				'1:16'
			]);
			expect(range('instrument.m1.wavetable', 'turn E1')?.shows?.map((s) => s.shows)).toEqual([
				'basic',
				'buzz',
				'crush',
				'drawbars',
				'fibonacci',
				'fractal',
				'geometric',
				'primes',
				'zap'
			]);
			const tune = range('instrument.m1.drum', 'turn E1');
			expect(tune).toMatchObject({ step: 0.1, fine: 0.01 });
			expect(Number(tune?.first.replace('–', '-'))).toBeLessThanOrEqual(-16.1);
			expect(values('instrument.m1.drum', 'turn E4')).toEqual([
				'key',
				'oneshot',
				'mute group',
				'loop'
			]);
			// the loop crossfade tops out at 75 % (research 60 §5)
			expect(range('instrument.m1.sampler', 'shift + turn E3')?.last).toBe('75%');
		});

		it('§2.6 the preset browser lists the engines alphabetically (then midi, ours)', () => {
			expect(values('instrument.presets', 'turn E1')).toEqual([
				'axis',
				'dissolve',
				'drum',
				'epiano',
				'hardsync',
				'multisampler',
				'organ',
				'prism',
				'sampler',
				'simple',
				'wavetable',
				'midi'
			]);
			expect(control('instrument.presets', 'click E2').does).toMatch(/^opens prism: /);
		});

		it('§2.7 players: the arpeggio’s speeds and ranges; maestro’s E3 has no job', () => {
			expect(values('player.arpeggio', 'turn E1')).toEqual([
				'1/4',
				'1/8',
				'1/8t',
				'1/16',
				'1/16t',
				'1/32',
				'1/32t',
				'1/64'
			]);
			expect(values('player.arpeggio', 'turn E3')).toEqual(['1 oct', '2 oct', '3 oct', '4 oct']);
			expect(page('player.maestro').controls.some((c) => c.encoder === 3)).toBe(false);
			expect(page('player.hold').controls).toEqual([]);
		});

		it('§2.10 mixer: the labels of M2, M3 and M4', () => {
			expect(labels('mix.m2', 'base')).toEqual(['low', 'mid', 'high', 'blend']);
			expect(labels('mix.m3', 'base')).toEqual(['gain', 'clip', 'tone', 'mix']);
			expect(labels('mix.m4', 'base')).toEqual(['percussion', 'melodic', 'compressor', 'master']);
		});

		it('§2.11 tempo: 40–220 bpm and the eleven grooves’ letters in E2’s order', () => {
			expect(range('tempo', 'turn E1')).toMatchObject({ first: '40', last: '220', step: 1 });
			expect(
				range('tempo', 'turn E2')
					?.shows?.map((s) => s.shows)
					.join(' ')
			).toBe('SH HS DA BO WO GA AC IN DF RO PR');
		});

		it('§2.13 auxiliary tracks: brain, external MIDI, external audio, tape and the effects', () => {
			expect(values('auxiliary.brain.m1', 'turn E3')).toEqual([
				'major',
				'dorian',
				'phrygian',
				'lydian',
				'mixo',
				'minor',
				'locrian'
			]);
			expect(values('auxiliary.brain.m1', 'turn E2')).toHaveLength(12);
			expect(values('auxiliary.brain.m1', 'turn E4')?.slice(0, 3)).toEqual(['off', '01', '02']);
			expect(range('auxiliary.external-midi.m1', 'turn E1')).toMatchObject({
				first: '01',
				last: '16'
			});
			for (const keys of ['turn E2', 'turn E3']) {
				expect(range('auxiliary.external-midi.m1', keys)).toMatchObject({
					first: 'none',
					last: '128'
				});
			}
			expect(range('auxiliary.external-audio.m1', 'turn E2')).toMatchObject({
				first: '00',
				last: '20'
			});
			expect(range('auxiliary.tape.m1', 'turn E1')).toMatchObject({ first: 'x1', last: 'x10' });
			expect(range('auxiliary.tape.m1', 'turn E2')).toMatchObject({ first: '50', last: '200' });
			expect(range('auxiliary.tape.m1', 'turn E3')).toMatchObject({ first: '1', last: '16' });
			expect(values('auxiliary.fx-i.m1.delay', 'turn E1')).toEqual([
				'1/32',
				'1/32 dotted',
				'1/16',
				'1/16 dotted',
				'1/8',
				'1/8 dotted',
				'1/4',
				'1/2'
			]);
			expect(control('auxiliary.fx-i.m1.delay', 'turn E1').value).toBe('1/8 dotted');
			expect(labels('auxiliary.fx-i.m1.delay', 'base')).toEqual([
				'size',
				'fine',
				'feedback',
				'dry'
			]);
			expect(labels('auxiliary.fx-i.m1.reverb', 'base')).toEqual(['size', 'mod', 'tone', 'dry']);
			expect(labels('auxiliary.fx-i.m1.distortion', 'base')).toEqual([
				'drive',
				'clip',
				'lo cut',
				'hi cut'
			]);
			// the external MIDI track's CC values move once a slot has a CC number
			expect(control('auxiliary.external-midi.m2', 'turn E1').needs).toBe('shift + turn E1 first');
		});

		it('§3 MIDI reach: the synth engines answer on M1, the samplers and the CV page do not', () => {
			expect(control('instrument.m1.prism', 'turn E1').midi).toMatchObject({
				cc: 12,
				reach: 'answers'
			});
			for (const engine of ['drum', 'sampler', 'multisampler']) {
				expect(control(`instrument.m1.${engine}`, 'turn E1').midi?.reach).toBe('ignores');
			}
			expect(control('instrument.m2', 'turn E1').midi).toMatchObject({ cc: 20, reach: 'answers' });
			expect(control('instrument.m2', 'turn E1').midi?.cc).toBe(20);
			expect(page('instrument.m2').controls.find((c) => c.layer === 'alt')?.midi?.cc).toBe(24);
			expect(control('mix.m2', 'turn E4').midi).toMatchObject({
				cc: 90,
				channel: 4,
				reach: 'ignores'
			});
			expect(control('tempo', 'turn E3').midi).toMatchObject({ cc: 81, reach: 'answers' });
			expect(page('auxiliary.external-cv.m1').controls).toEqual([]);
			// external audio's level answered though the CC map lists no lane for it
			expect(control('auxiliary.external-audio.m1', 'turn E3').midi).toEqual({
				cc: 14,
				channel: 'track',
				reach: 'answers'
			});
		});
	});

	it('says a CC answers wherever the CC map marks it verified on OS 1.1.33', () => {
		const kinds: Readonly<Record<string, ReachKind>> = {
			instrument: 'synth',
			brain: 'brain',
			externalMidi: 'external-midi',
			externalAudio: 'external-audio',
			tape: 'tape',
			fx: 'fx-i'
		};
		const types = ccMapJson.trackTypes as Record<
			string,
			{ params?: { cc: number; verifiedOn?: string }[] }
		>;
		let checked = 0;
		for (const [type, kind] of Object.entries(kinds)) {
			for (const entry of types[type].params ?? []) {
				if (entry.verifiedOn !== '1.1.33') continue;
				expect(midiReach(kind, entry.cc), `${type} CC${entry.cc}`).toBe('answers');
				checked++;
			}
		}
		for (const entry of ccMapJson.perTrack) {
			if ('verifiedOn' in entry) expect(midiReach('synth', entry.cc)).toBe('answers');
		}
		expect(checked).toBeGreaterThan(30);
	});
});
