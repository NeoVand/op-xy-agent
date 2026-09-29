// Glyphs: every control the key grammar can name is drawn as the replica draws it and called what
// the manual calls it, and a combo breaks into keys, joiners and words in reading order.
import { describe, expect, it } from 'vitest';
import { CONTROLS, parseKeys, type ControlId } from '$lib/core/opxy';
import {
	comboIds,
	comboPieces,
	controlGlyph,
	parseCombo,
	controlName,
	placeholderGlyph,
	type ComboPiece
} from './art';

/** A combo's pieces as short strings: glyph names, joiners, words, separators. */
const read = (keys: string) =>
	comboPieces(parseKeys(keys)).map((piece: ComboPiece) => {
		switch (piece.kind) {
			case 'glyph':
				return `[${piece.name}${piece.stacked ? ' ×' : ''}${piece.turn ? ' ↻' : ''}]`;
			case 'join':
				return piece.op;
			case 'word':
				return piece.text;
			case 'sep':
				return piece.text;
		}
	});

describe('control glyphs', () => {
	it('draws every control the key grammar can name', () => {
		const named = CONTROLS.filter((c) => c.token !== null);
		expect(named.length).toBe(68 + 4 + 3);
		for (const control of named) {
			const art = controlGlyph(control.id);
			expect(art, control.id).not.toBeNull();
			if (control.kind === 'key') expect(art?.kind, control.id).toBe('key');
			if (control.kind === 'encoder') expect(art?.kind, control.id).toBe('encoder');
		}
		expect(controlGlyph('knob.volume')?.kind).toBe('volume');
		expect(controlGlyph('strip.pitchbend')?.kind).toBe('pitchbend');
		expect(controlGlyph('screen.main')).toBeNull();
	});

	it('keeps TE’s legends, and numbers the blank step keys', () => {
		const m3 = controlGlyph('key.m3');
		const step = controlGlyph('step.5');
		const t5 = controlGlyph('track.5');
		if (m3?.kind !== 'key' || step?.kind !== 'key' || t5?.kind !== 'key') throw new Error('keys');
		expect(m3.legend.length).toBeGreaterThan(0);
		expect(m3.mark).toBeNull();
		expect(m3.led).toBeNull();
		expect(step.legend).toEqual([]);
		expect(step.mark).toBe('5');
		expect(t5.led).not.toBeNull();
		expect(controlGlyph('key.record')).toMatchObject({ colors: { legend: '#ff3a14' } });
	});

	it('shows the encoders’ cap colours dark to white', () => {
		const tones = (['encoder.1', 'encoder.2', 'encoder.3', 'encoder.4'] as ControlId[]).map((id) =>
			controlGlyph(id)
		);
		expect(tones.map((art) => (art?.kind === 'encoder' ? art.tone : -1))).toEqual([0, 1, 2, 3]);
	});

	it('marks a placeholder’s key with its letter instead of a legend', () => {
		expect(placeholderGlyph('Tn')).toMatchObject({ kind: 'key', legend: [], mark: 'n' });
		expect(placeholderGlyph('step m')).toMatchObject({ mark: 'm' });
	});
});

describe('names', () => {
	it('says the manual’s name, and the unit’s where they differ', () => {
		const cases: [ControlId, string][] = [
			['key.m3', 'M3'],
			['key.shift', 'shift'],
			['track.5', 'T5 · track 5'],
			['step.5', 'step 5'],
			['keyboard.fs3', 'accidental 1 · F#3'],
			['keyboard.f3', 'natural 1 · F3'],
			['encoder.2', 'E2 · mid gray encoder'],
			['key.minus', '[-] · minus'],
			['knob.volume', 'volume']
		];
		for (const [id, name] of cases) expect(controlName(id), id).toBe(name);
	});
});

describe('combo pieces', () => {
	it('reads a combo left to right: keys, joiners and gesture words', () => {
		expect(read('shift + M1')).toEqual(['[shift]', '+', '[M1]']);
		expect(read('record + play → play')).toEqual(['[record]', '+', '[play]', '→', '[play]']);
		expect(read('shift + player → + turn E1')).toEqual([
			'[shift]',
			'+',
			'[player]',
			'→ +',
			'turn',
			'[E1 · dark gray encoder ↻]'
		]);
		expect(read('hold com')).toEqual(['hold', '[com]']);
		expect(read('click E4')).toEqual(['click', '[E4 · white encoder]']);
	});

	it('draws short ranges in full, long ones by their ends', () => {
		expect(read('turn E1…E4')).toHaveLength(5);
		expect(read('T1…T8')).toEqual(['[T1 · track 1]', '…', '[T8 · track 8]']);
		expect(read('[-]/[+]')).toEqual(['[[-] · minus]', '/', '[[+] · plus]']);
	});

	it('draws placeholders as their group, plurals as a stack', () => {
		const [step] = comboPieces(parseKeys('step n + turn E2'));
		expect(step).toMatchObject({ kind: 'glyph', stacked: false });
		expect(step.kind === 'glyph' && step.ids.length).toBe(16);
		expect(read('shift + steps')).toEqual(['[shift]', '+', '[steps · one or more step keys ×]']);
	});

	it('lists the controls a combo touches, none when it does not parse', () => {
		expect(comboIds('shift + M1')).toEqual(['key.shift', 'key.m1']);
		expect(comboIds('shift + banana')).toEqual([]);
	});
});

describe('mentions', () => {
	it('draws an encoder or the volume knob named on its own, without the turn', () => {
		const e1 = parseCombo('E1');
		expect(e1?.mention).toBe(true);
		if (!e1) return;
		expect(comboPieces(e1.sequence, true)).toMatchObject([
			{ kind: 'glyph', name: 'E1 · dark gray encoder', turn: false }
		]);
		expect(parseCombo('E1…E4')?.mention).toBe(true);
		expect(parseCombo('volume')?.mention).toBe(true);
		expect(parseCombo('shift + M1')?.mention).toBe(false);
		expect(parseCombo('E1 + stop')).toBeNull();
		expect(comboIds('E2')).toEqual(['encoder.2']);
	});
});
