// Telling drum sounds apart, on sounds synthesized here (the generated voices and a few plain
// ones): the file name first, then the sound itself, then the keys TE's factory layout gives them.
import { describe, expect, it } from 'vitest';
import {
	DRUM_KINDS,
	TE_LAYOUT,
	TE_SLOT_NAMES,
	classifyDrum,
	drumFeatures,
	kindFromName,
	kindFromSound,
	nameWords,
	placeDrums,
	type DrumKind
} from './classify';
import { KIT_STYLES, generateKit, renderVoice, type VoiceType } from './generate';
import type { PcmAudio } from './wav';

const SR = 44100;
const audio = (x: Float32Array): PcmAudio => ({ sampleRate: SR, channels: [x] });
const bySound = (a: PcmAudio) => kindFromSound(drumFeatures(a)).kind;

/** The kind each generated voice should be heard as. */
const EXPECTED: Readonly<Record<VoiceType, DrumKind>> = {
	kick: 'kick',
	snare: 'snare',
	clap: 'clap',
	rim: 'rim',
	'closed hat': 'closed hat',
	'open hat': 'open hat',
	cymbal: 'crash',
	tom: 'tom',
	conga: 'conga',
	cowbell: 'cowbell',
	clave: 'clave',
	shaker: 'shaker',
	tambourine: 'tambourine',
	triangle: 'triangle',
	guiro: 'guiro',
	zap: 'fx'
};

describe('drum kinds from file names', () => {
	it('reads names as words, whatever their case, separators and numbers', () => {
		expect(nameWords('SnareRoll_02.wav')).toBe('snare roll 02');
		expect(nameWords('BD01.WAV')).toBe('bd 01');
		expect(nameWords('hh-open (3).aif')).toBe('hh open 3');
	});

	it('knows the usual names, the most specific first', () => {
		const cases: [string, DrumKind][] = [
			['BD_01.wav', 'kick'],
			['Kick Hard.wav', 'kick'],
			['808 Kik.wav', 'kick'],
			['SD_tight.wav', 'snare'],
			['snare rim.wav', 'rim'],
			['Rimshot2.wav', 'rim'],
			['CP_909.wav', 'clap'],
			['HandClap.wav', 'clap'],
			['hh-open.wav', 'open hat'],
			['OHH 01.wav', 'open hat'],
			['Open Hat.wav', 'open hat'],
			['CHH.wav', 'closed hat'],
			['hat.wav', 'closed hat'],
			['HiHat_closed.wav', 'closed hat'],
			['Floor Tom.wav', 'tom'],
			['tom hi.wav', 'tom'],
			['Conga Lo.wav', 'conga'],
			['ride bell.wav', 'ride'],
			['Crash-01.wav', 'crash'],
			['china.wav', 'crash'],
			['Cowbell.wav', 'cowbell'],
			['claves.wav', 'clave'],
			['Shaker 2.wav', 'shaker'],
			['tamb.wav', 'tambourine'],
			['triangle.wav', 'triangle'],
			['Guiro.wav', 'guiro'],
			['laser zap.wav', 'fx'],
			['perc 4.wav', 'perc']
		];
		for (const [name, kind] of cases) expect([name, kindFromName(name)]).toEqual([name, kind]);
	});

	it('does not read a kind into names without one', () => {
		for (const name of ['take 1.wav', 'sample.wav', 'hatchback.wav', 'shadow.wav', 'Tomato.wav']) {
			expect([name, kindFromName(name)]).toEqual([name, null]);
		}
	});

	it('lets the name win over the sound', () => {
		const kick = renderVoice({ type: 'kick' });
		expect(classifyDrum('snare 3.wav', kick)).toMatchObject({ kind: 'snare', from: 'name' });
		expect(classifyDrum('take 3.wav', kick)).toMatchObject({ kind: 'kick', from: 'sound' });
	});
});

describe('drum kinds from the sound', () => {
	it('hears every generated voice as its kind, in several takes and colours', () => {
		for (const type of Object.keys(EXPECTED) as VoiceType[]) {
			for (const variation of [{}, { tone: 0.1 }, { tone: 0.9 }, { seed: 7 }, { seed: 23 }]) {
				const heard = bySound(renderVoice({ type, ...variation }));
				expect([type, variation, heard]).toEqual([type, variation, EXPECTED[type]]);
			}
		}
	});

	it('hears kicks of any pitch and length, toms low to high and congas above them', () => {
		for (const pitch of [40, 50, 60, 70]) {
			for (const decay of [0.2, 0.5, 1.2]) {
				expect(bySound(renderVoice({ type: 'kick', pitch, decay }))).toBe('kick');
			}
		}
		for (const pitch of [95, 130, 180])
			expect(bySound(renderVoice({ type: 'tom', pitch }))).toBe('tom');
		for (const pitch of [220, 260, 320]) {
			expect(bySound(renderVoice({ type: 'conga', pitch }))).toBe('conga');
		}
	});

	it('tells closed from open hats and cymbals by how long they ring', () => {
		expect(bySound(renderVoice({ type: 'closed hat', decay: 0.04 }))).toBe('closed hat');
		expect(bySound(renderVoice({ type: 'open hat', decay: 0.5 }))).toBe('open hat');
		expect(bySound(renderVoice({ type: 'cymbal', decay: 2 }))).toBe('crash');
	});

	it('hears plain synthesized sounds too: a clean sine kick and a noisy snare with a body', () => {
		const n = Math.round(0.4 * SR);
		const kick = new Float32Array(n);
		let phase = 0;
		for (let i = 0; i < n; i++) {
			const t = i / SR;
			phase += (2 * Math.PI * (55 + 120 * Math.exp(-t / 0.02))) / SR;
			kick[i] = Math.sin(phase) * Math.exp(-t / 0.12);
		}
		expect(bySound(audio(kick))).toBe('kick');
		let seed = 1;
		const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
		const snare = Float32Array.from({ length: Math.round(0.3 * SR) }, (_, i) => {
			const t = i / SR;
			return (
				0.8 * Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t / 0.04) +
				0.5 * rand() * Math.exp(-t / 0.06)
			);
		});
		expect(bySound(audio(snare))).toBe('snare');
	});

	it('knows at least 20 of the 24 sounds of every generated kit without their names', () => {
		for (const style of KIT_STYLES) {
			const kit = generateKit(style);
			const right = kit.filter((s, i) => {
				const heard = bySound(s.audio);
				const slot = TE_LAYOUT[i];
				// a ride heard as a crash still goes on a cymbal key
				return heard === slot || (slot === 'ride' && heard === 'crash');
			}).length;
			expect([style, right >= 20]).toEqual([style, true]);
		}
	});

	it('measures silence as nothing, without failing', () => {
		const f = drumFeatures(audio(new Float32Array(2000)));
		expect(f).toMatchObject({ decay: 0, tonal: 0, pitch: 0 });
		expect(bySound(audio(new Float32Array(2000)))).toBe('perc');
	});
});

describe('placing sounds on TE’s layout', () => {
	it('names every key of the layout', () => {
		expect(TE_LAYOUT).toHaveLength(24);
		expect(TE_SLOT_NAMES.slice(0, 6)).toEqual(['kick', 'kick', 'snare', 'snare', 'rim', 'clap']);
		expect(TE_SLOT_NAMES[12]).toBe('low tom');
		expect(TE_SLOT_NAMES[16]).toBe('high tom');
		expect(TE_SLOT_NAMES[23]).toBe('chi');
		for (const kind of TE_LAYOUT) expect(DRUM_KINDS).toContain(kind);
	});

	it('puts each kind on its keys: two kicks on 53–54, snares 55–56, hats 61–63', () => {
		const keys = placeDrums([
			{ kind: 'closed hat' },
			{ kind: 'kick' },
			{ kind: 'snare' },
			{ kind: 'kick' },
			{ kind: 'open hat' },
			{ kind: 'clap' },
			{ kind: 'closed hat' }
		]);
		expect(keys).toEqual([61, 53, 55, 54, 63, 58, 62]);
	});

	it('orders toms and congas low to high by pitch', () => {
		const keys = placeDrums([
			{ kind: 'tom', pitch: 180 },
			{ kind: 'tom', pitch: 90 },
			{ kind: 'conga', pitch: 330 },
			{ kind: 'tom', pitch: 130 },
			{ kind: 'conga', pitch: 220 }
		]);
		expect(keys).toEqual([69, 65, 72, 67, 71]);
	});

	it('sends a third kick to its family’s keys, then anywhere free, and skips taken keys', () => {
		expect(placeDrums([{ kind: 'kick' }, { kind: 'kick' }, { kind: 'kick' }])).toEqual([
			53, 54, 65
		]);
		expect(placeDrums([{ kind: 'snare' }], [55])).toEqual([56]);
		// every key taken but one
		const taken = Array.from({ length: 24 }, (_, i) => 53 + i).filter((k) => k !== 70);
		expect(placeDrums([{ kind: 'kick' }, { kind: 'snare' }], taken)).toEqual([70, null]);
	});
});
