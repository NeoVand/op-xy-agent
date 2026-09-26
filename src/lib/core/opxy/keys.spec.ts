import { describe, expect, it } from 'vitest';
import officialDocsNote from '../../../../docs/research/40-official-docs.md?raw';
import { KeyParseError } from './errors';
import fixture from './fixtures/guide-key-combos.json';
import {
	formatKeys,
	keyControlIds,
	normalizeKeys,
	parseKeys,
	targetIds,
	tryParseKeys,
	type KeySequence
} from './keys';

/** The rows of the key-combo tables in docs/research/40-official-docs.md §4. */
function extractGuideCombos(markdown: string): { section: string; action: string; cell: string }[] {
	const start = markdown.indexOf('## 4. Key combos');
	const end = markdown.indexOf('\n## ', start + 1);
	const rows: { section: string; action: string; cell: string }[] = [];
	let section = '';
	for (const line of markdown.slice(start, end).split('\n')) {
		const heading = /^\*\*(.+)\*\*$/.exec(line);
		if (heading) section = heading[1];
		if (!line.startsWith('|')) continue;
		const cells = line
			.split('|')
			.slice(1, -1)
			.map((c) => c.trim());
		if (cells.length !== 3) throw new Error(`unexpected table row: ${line}`);
		if (cells[0] === 'Action' || /^-+$/.test(cells[0])) continue;
		rows.push({ section, action: cells[0], cell: cells[1] });
	}
	return rows;
}

const firstError = (input: string): KeyParseError => {
	const result = tryParseKeys(input);
	if (result.ok) throw new Error(`expected "${input}" to fail`);
	return result.error;
};

describe('the 95 key combos of docs/research/40-official-docs.md §4', () => {
	const rows = fixture.rows;
	const expressions = rows.flatMap((row) => row.exprs.map((expr) => ({ row, expr })));

	it('fixture mirrors the markdown tables row by row', () => {
		const fromDoc = extractGuideCombos(officialDocsNote);
		expect(fromDoc).toHaveLength(95);
		expect(rows.map(({ section, action, cell }) => ({ section, action, cell }))).toEqual(fromDoc);
		expect(rows.every((row) => row.exprs.length > 0)).toBe(true);
		expect(expressions).toHaveLength(170);
	});

	it.each(expressions.map(({ row, expr }) => [row.action, expr]))(
		'%s: %s parses',
		(_action, expr) => {
			expect(tryParseKeys(expr).ok).toBe(true);
		}
	);

	it('every canonical expression round-trips as text and as AST', () => {
		for (const { expr } of expressions) {
			const ast = parseKeys(expr);
			expect(formatKeys(ast), expr).toBe(expr);
			expect(parseKeys(formatKeys(ast)), expr).toEqual(ast);
		}
	});

	it('parses the doc’s own code spans directly, except a documented set of prose fragments', () => {
		const spans = rows.flatMap((row) => [...row.cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
		expect(spans).toHaveLength(184);
		const fragments = [...new Set(spans.filter((span) => !tryParseKeys(span).ok))];
		expect(fragments).toEqual([
			'Tn + Tm (+ …)', // repetition in prose → "Tn + Tm"
			'key + key + … + step n', // → "keys + step n"
			'E2', // elliptical "bar + turn E1 / E2 …"
			'E3',
			'E4',
			'shift + step n (…)', // → "shift + steps"
			'+ natural', // continuation → "→ + natural"
			'+ accidental',
			'shift + step n + same natural', // "same" is prose
			'shift + turn/click E3', // gesture alternatives → two expressions
			'shift + d#', // note name → "accidental 0"
			'shift + M2, M3', // comma list
			'hold Tn (…)' // repetition in prose
		]);
	});

	it('only references real controls', () => {
		for (const { expr } of expressions) {
			expect(keyControlIds(parseKeys(expr)).length, expr).toBeGreaterThan(0);
		}
	});
});

describe('parseKeys', () => {
	it('parses a combo into held keys and a final press', () => {
		expect(parseKeys('shift + M1')).toEqual({
			chords: [
				{
					keepHeld: false,
					terms: [
						{ gesture: 'press', target: { kind: 'control', id: 'key.shift', spelling: 'token' } },
						{ gesture: 'press', target: { kind: 'control', id: 'key.m1', spelling: 'token' } }
					]
				}
			]
		} satisfies KeySequence);
	});

	it('reads gestures', () => {
		const gestures = (input: string) =>
			parseKeys(input).chords.flatMap((c) =>
				c.terms.map((t) => `${t.gesture}:${targetIds(t.target).join('|')}`)
			);
		expect(gestures('hold com')).toEqual(['hold:key.com']);
		expect(gestures('turn E2')).toEqual(['turn:encoder.2']);
		expect(gestures('click E1')).toEqual(['click:encoder.1']);
		expect(gestures('step 5 + turn E2')).toEqual(['press:step.5', 'turn:encoder.2']);
		expect(gestures('record + hold stop')).toEqual(['press:key.record', 'hold:key.stop']);
		expect(gestures('click E3 + turn E3')).toEqual(['click:encoder.3', 'turn:encoder.3']);
		expect(gestures('turn volume')).toEqual(['turn:knob.volume']);
		expect(gestures('com + power')).toEqual(['press:key.com', 'press:switch.power']);
		expect(gestures('hold pitchbend')).toEqual(['hold:strip.pitchbend']);
	});

	it('reads sequences and continuations', () => {
		const seq = parseKeys('shift + steps → + natural → + accidental');
		expect(seq.chords.map((c) => c.keepHeld)).toEqual([false, true, true]);
		expect(parseKeys('stop → stop').chords).toHaveLength(2);
		expect(normalizeKeys('stop -> stop')).toBe('stop → stop');
		expect(normalizeKeys('record+play->play')).toBe('record + play → play');
	});

	it('reads placeholders with their candidate controls', () => {
		const target = (input: string) => parseKeys(input).chords[0].terms[0].target;
		expect(target('Tn')).toMatchObject({ kind: 'placeholder', name: 'Tn', plural: false });
		expect(targetIds(target('Tn'))).toHaveLength(8);
		expect(target('keys')).toMatchObject({ plural: true });
		expect(targetIds(target('keys'))).toHaveLength(24);
		expect(targetIds(target('naturals'))).toHaveLength(14);
		expect(targetIds(target('accidental'))).toHaveLength(10);
		expect(targetIds(target('steps'))).toHaveLength(16);
		expect(normalizeKeys('tn + TM')).toBe('Tn + Tm');
		expect(normalizeKeys('Step N + step M')).toBe('step n + step m');
	});

	it('reads ranges left to right within one group', () => {
		const ids = (input: string) => targetIds(parseKeys(input).chords[0].terms[0].target);
		expect(ids('turn E1…E4')).toEqual(['encoder.1', 'encoder.2', 'encoder.3', 'encoder.4']);
		expect(ids('M1…M4')).toEqual(['key.m1', 'key.m2', 'key.m3', 'key.m4']);
		expect(ids('T1…T8')).toHaveLength(8);
		expect(ids('step 1…16')).toHaveLength(16);
		expect(ids('key F3…A3')).toEqual([
			'keyboard.f3',
			'keyboard.fs3',
			'keyboard.g3',
			'keyboard.gs3',
			'keyboard.a3'
		]);
		expect(normalizeKeys('turn E1...E3')).toBe('turn E1…E3');
		expect(normalizeKeys('step 1…step 4')).toBe('step 1…4');
	});

	it('reads alternatives', () => {
		const target = parseKeys('shift + [-]/[+]').chords[0].terms[1].target;
		expect(target).toEqual({
			kind: 'alternatives',
			options: [
				{ kind: 'control', id: 'key.minus', spelling: 'token' },
				{ kind: 'control', id: 'key.plus', spelling: 'token' }
			]
		});
		expect(normalizeKeys('bar + shift + [+]')).toBe('bar + shift + [+]');
	});

	it('spells keyboard keys by note, natural or accidental number', () => {
		const ref = (input: string) => parseKeys(input).chords[0].terms[0].target;
		expect(ref('natural 1')).toEqual({ kind: 'control', id: 'keyboard.f3', spelling: 'natural' });
		expect(ref('accidental 0')).toEqual({
			kind: 'control',
			id: 'keyboard.ds5',
			spelling: 'accidental'
		});
		expect(ref('natural 14')).toMatchObject({ id: 'keyboard.e5' });
		for (const spelling of ['key F#3', 'key Gb3', 'key fs3', 'key F♯3', 'key G♭3']) {
			expect(normalizeKeys(spelling), spelling).toBe('key F#3');
		}
		expect(normalizeKeys('key c4')).toBe('key C4');
		expect(normalizeKeys('shift + natural 3')).toBe('shift + natural 3');
	});

	it('accepts labels and aliases, printing the canonical tokens back', () => {
		expect(normalizeKeys('Shift + m1')).toBe('shift + M1');
		expect(normalizeKeys('shift + minus')).toBe('shift + [-]');
		expect(normalizeKeys('turn dark gray knob')).toBe('turn E1');
		expect(normalizeKeys('mixer')).toBe('mix');
		expect(normalizeKeys('shift + players')).toBe('shift + player');
		expect(normalizeKeys('track 3 + M4')).toBe('T3 + M4');
		expect(normalizeKeys('hold brain')).toBe('hold T1');
	});

	it('lists the controls a sequence touches, in order', () => {
		expect(keyControlIds(parseKeys('shift + T1…T3 → T1'))).toEqual([
			'key.shift',
			'track.1',
			'track.2',
			'track.3'
		]);
	});
});

describe('parseKeys rejects what the device cannot do', () => {
	it.each([
		['shfit + M1', /unknown control "shfit" — did you mean "shift"\?/, 0],
		['shift + M9', /unknown control "M9"/, 8],
		['', /empty key combo/, 0],
		['shift +', /expected a control at the end/, 7],
		['shift + + M1', /the plus key is written "\[\+\]"/, 8],
		['shift - M1', /write the minus key as "\[-\]"/, 6],
		['shift + M1)', /unexpected character "\)"/, 10],
		['E1', /E1 is an encoder: write "turn E1" or "click E1"/, 0],
		['hold E2', /E2 is an encoder/, 0],
		['turn shift', /cannot turn shift/, 0],
		['click M1', /cannot click M1/, 0],
		['turn screen', /unknown control "screen"/, 5],
		['hold shift + M1', /"hold" only goes on the last key/, 0],
		['turn E1 + shift', /"turn" must be the last action/, 0],
		['stop → + play', /holds none/, 7],
		['shift + shift', /appears twice in one chord/, 8],
		['Tn + Tn', /"Tn" appears twice/, 5],
		['key C2', /outside the keyboard/, 0],
		['shift + turn/click E3', /"turn" must be followed by one control/, 8],
		['E4…E1', /runs left to right/, 0],
		['E1…T3', /not a range of one group/, 0],
		['natural 1…3', /must start at a control written by its name/, 0],
		['T1…nope', /cannot end a range at "nope"/, 3],
		['Tn/Tm', /alternatives \("a\/b"\) must name single controls/, 0],
		['shift + M1 shift', /unknown control "M1 shift"/, 8],
		['→ shift', /expected a control before "→"/, 0]
	])('%s', (input, message, offset) => {
		const error = firstError(input);
		expect(error).toBeInstanceOf(KeyParseError);
		expect(error.name).toBe('KeyParseError');
		expect(error.message).toMatch(message);
		expect(error.offset).toBe(offset);
		expect(error.input).toBe(input);
		expect(() => parseKeys(input)).toThrow(KeyParseError);
	});

	it('does not swallow unrelated errors', () => {
		expect(tryParseKeys('shift + M1')).toMatchObject({ ok: true });
		expect(tryParseKeys('nope')).toMatchObject({ ok: false });
	});
});
