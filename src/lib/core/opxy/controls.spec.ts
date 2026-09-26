import { describe, expect, it } from 'vitest';
import {
	COLOR_TOKENS,
	CONTROLS,
	KEYS,
	LED_KEYS,
	PANEL,
	colorHex,
	controlsInGroup,
	controlsOfKind,
	findControl,
	getControl,
	guideUrl,
	keyboardKeyForNote,
	ledCenter,
	resolveControl,
	visibleTileRect
} from './controls';
import type { Control } from './controls.schema';
import { UnknownControlError } from './errors';
import { CONTROL_IDS, KEY_IDS, isControlId, type ControlId } from './ids';

const P = PANEL.grid.pitch;
const { x: OX, y: OY } = PANEL.grid.origin;
const close = (a: number, b: number, tolerance = 0.011) => Math.abs(a - b) <= tolerance;

describe('inventory', () => {
	it('has every id exactly once, matching the TypeScript contract', () => {
		const ids = CONTROLS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect([...ids].sort()).toEqual([...CONTROL_IDS].sort());
		expect(CONTROLS).toHaveLength(86);
	});

	it('counts what TE counts: 68 keys, 48 LED windows, 4 encoders, 1 volume knob', () => {
		expect(KEYS).toHaveLength(68);
		expect(KEY_IDS).toHaveLength(68);
		expect(KEYS.map((k) => k.id).sort()).toEqual([...KEY_IDS].sort());
		expect(LED_KEYS).toHaveLength(48);
		expect(controlsOfKind('encoder')).toHaveLength(4);
		expect(controlsOfKind('knob')).toHaveLength(1);
		expect(controlsOfKind('port')).toHaveLength(5);
		const byGroup = (group: Control['group']) => controlsInGroup(group).length;
		expect([byGroup('mode'), byGroup('module'), byGroup('track'), byGroup('step')]).toEqual([
			4, 4, 8, 16
		]);
		expect([byGroup('transport'), byGroup('keyboard'), byGroup('function')]).toEqual([6, 24, 6]);
	});

	it('puts LED windows on exactly the track, step and keyboard keys', () => {
		const groups = new Set(LED_KEYS.map((k) => k.group));
		expect(groups).toEqual(new Set(['track', 'step', 'keyboard']));
	});

	it('gives ordered groups a 1-based index that matches the id', () => {
		for (const control of CONTROLS) {
			const suffix = Number(control.id.split('.')[1]);
			if (['track', 'step', 'encoder'].includes(control.group)) expect(control.index).toBe(suffix);
		}
		expect(controlsInGroup('module').map((c) => c.index)).toEqual([1, 2, 3, 4]);
	});

	it('uses grammar tokens that are unique and never contain grammar operators', () => {
		const tokens = CONTROLS.map((c) => c.token).filter((t): t is string => t !== null);
		expect(new Set(tokens).size).toBe(tokens.length);
		for (const token of tokens) expect(token).not.toMatch(/ \+ |→|\/|…/);
		expect(KEYS.every((k) => k.token !== null)).toBe(true);
	});

	it('names the auxiliary track behind every track key (T1 brain … T8 FX II)', () => {
		const aliases = controlsInGroup('track').map((c) => c.track?.auxiliary.alias);
		expect(aliases).toEqual([
			'T1 brain',
			'T2 punch-in FX',
			'T3 external MIDI',
			'T4 external CV',
			'T5 external audio',
			'T6 tape',
			'T7 FX I',
			'T8 FX II'
		]);
		expect(controlsInGroup('track').map((c) => c.track?.auxiliary.track)).toEqual([
			9, 10, 11, 12, 13, 14, 15, 16
		]);
	});
});

describe('keyboard', () => {
	const keyboard = controlsInGroup('keyboard');

	it('spans F3–E5: MIDI 53–76 left to right, C4 = 60', () => {
		expect(keyboard.map((k) => k.keyboard?.note)).toEqual(
			Array.from({ length: 24 }, (_, i) => 53 + i)
		);
		expect(getControl('keyboard.c4').keyboard?.note).toBe(60);
		expect(keyboard.every((k) => k.midi?.note === k.keyboard?.note)).toBe(true);
	});

	it('has 14 naturals on the bottom row with the 14 step components', () => {
		const naturals = keyboard.filter((k) => k.keyboard?.type === 'natural');
		expect(naturals.map((k) => k.keyboard?.number)).toEqual(
			Array.from({ length: 14 }, (_, i) => i + 1)
		);
		expect(naturals.every((k) => k.geometry.grid?.row === 5)).toBe(true);
		expect(new Set(naturals.map((k) => k.keyboard?.stepComponent)).size).toBe(14);
		expect(naturals[0].keyboard?.stepComponent).toBe('pulse');
		expect(naturals[13].keyboard?.stepComponent).toBe('skip trigger');
	});

	it('has 10 accidentals on row 4, printed 1–9 then 0', () => {
		const accidentals = keyboard.filter((k) => k.keyboard?.type === 'accidental');
		expect(accidentals.map((k) => k.keyboard?.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
		expect(accidentals.every((k) => k.geometry.grid?.row === 4)).toBe(true);
		expect(accidentals.every((k) => k.keyboard?.stepComponent === undefined)).toBe(true);
	});

	it('finds keys by note', () => {
		expect(keyboardKeyForNote(53)?.id).toBe('keyboard.f3');
		expect(keyboardKeyForNote(75)?.id).toBe('keyboard.ds5');
		expect(keyboardKeyForNote(52)).toBeUndefined();
		expect(keyboardKeyForNote(77)).toBeUndefined();
	});
});

describe('MIDI facts', () => {
	it('gives all 72 pressable/clickable controls a distinct remote key 0–71', () => {
		const values = CONTROLS.map((c) => c.midi?.remoteKey).filter((v) => v != null);
		expect([...values].sort((a, b) => (a as number) - (b as number))).toEqual(
			Array.from({ length: 72 }, (_, i) => i)
		);
		expect(getControl('knob.volume').midi?.remoteKey).toBeNull();
	});

	it('lists the 76 controller-mode identities of the bench census, all distinct', () => {
		const emits = CONTROLS.flatMap((c) => c.midi?.controllerMode ?? []);
		expect(emits).toHaveLength(76);
		const keys = emits.map((e) => `${e.message}${e.number}`);
		expect(new Set(keys).size).toBe(76);
		expect(emits.filter((e) => e.message === 'note')).toHaveLength(24);
	});

	it('follows the derived offsets: ctrl CC = remote key + 5, keyboard note = remote key + 27', () => {
		for (const control of CONTROLS) {
			const midi = control.midi;
			if (midi?.remoteKey == null) continue;
			const press = midi.controllerMode.find((e) => e.input !== 'turn');
			const offset = press?.message === 'note' ? 27 : 5;
			expect(press?.number, control.id).toBe(midi.remoteKey + offset);
		}
	});

	it('reports true holds only for transport keys and the keyboard', () => {
		const holders = CONTROLS.filter((c) => c.midi?.controllerMode.some((e) => e.reportsHold)).map(
			(c) => c.id
		);
		expect(holders).toEqual(
			expect.arrayContaining(['key.record', 'key.play', 'key.stop', 'keyboard.f3'])
		);
		expect(holders).toHaveLength(3 + 24);
	});
});

describe('geometry', () => {
	const top = CONTROLS.filter((c) => c.geometry.face === 'top');
	const gridded = top.filter((c) => c.geometry.grid !== undefined);

	it('places every grid control on the 15.5 mm grid', () => {
		for (const control of gridded) {
			const { grid, rect } = control.geometry;
			if (!grid) continue;
			expect(close(rect.x, OX + grid.col * P), control.id).toBe(true);
			expect(close(rect.y, OY + grid.row * P), control.id).toBe(true);
			expect(close(rect.w, grid.cols * P), control.id).toBe(true);
			expect(close(rect.h, grid.rows * P), control.id).toBe(true);
		}
	});

	it('tiles the 17 × 6 grid exactly: no gaps, no overlaps', () => {
		const cells = gridded.reduce(
			(sum, c) => sum + (c.geometry.grid?.cols ?? 0) * (c.geometry.grid?.rows ?? 0),
			0
		);
		expect(cells).toBe(PANEL.grid.columns * PANEL.grid.rows);
		for (let i = 0; i < gridded.length; i++) {
			for (let j = i + 1; j < gridded.length; j++) {
				const a = gridded[i].geometry.rect;
				const b = gridded[j].geometry.rect;
				const overlap =
					Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 &&
					Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;
				expect(overlap, `${gridded[i].id} overlaps ${gridded[j].id}`).toBe(false);
			}
		}
	});

	it('keeps every top-face feature inside the 285 × 102 mm body', () => {
		expect([PANEL.body.width, PANEL.body.height]).toEqual([285, 102]);
		for (const { id, geometry } of top) {
			const { x, y, w, h } = geometry.rect;
			expect(x >= 0 && y >= 0 && x + w <= 285 && y + h <= 102, id).toBe(true);
		}
		// The note measured the grid as 263.7 mm wide (pitch 15.51) but rounds the pitch to 15.50,
		// so the right margin drifts by 0.2 mm over 17 tiles — inside its stated ~1% accuracy.
		const rightMargin = 285 - (OX + PANEL.grid.columns * P);
		expect(close(rightMargin, PANEL.grid.margins.right, 0.25)).toBe(true);
	});

	it('centres keycaps on their tiles, except accidentals (on the naturals’ boundary) and volume', () => {
		for (const control of gridded) {
			const { rect, center } = control.geometry;
			if (control.keyboard?.type === 'accidental') {
				const boundary = Math.round((center.x - OX) / P);
				expect(close(center.x, OX + boundary * P), control.id).toBe(true);
			} else if (control.id !== 'knob.volume') {
				expect(close(center.x, rect.x + rect.w / 2), control.id).toBe(true);
				expect(close(center.y, rect.y + rect.h / 2), control.id).toBe(true);
			}
		}
	});

	it('never lets two keycaps touch', () => {
		const d = PANEL.keycap.diameter;
		for (let i = 0; i < KEYS.length; i++) {
			for (let j = i + 1; j < KEYS.length; j++) {
				const a = KEYS[i].geometry.center;
				const b = KEYS[j].geometry.center;
				expect(Math.hypot(a.x - b.x, a.y - b.y) > d, `${KEYS[i].id} ${KEYS[j].id}`).toBe(true);
			}
		}
	});

	// Centres (mm) as tabulated in docs/research/50-hardware-ui.md §2, rounded there to 0.1 mm.
	const documented: [ControlId, number, number][] = [
		['speaker.internal', 19.9, 19.9],
		['knob.volume', 43.3, 12.2],
		['key.project', 43.2, 27.7],
		['key.tempo', 58.7, 27.7],
		['screen.main', 97.4, 19.9],
		['encoder.1', 144.0, 19.9],
		['encoder.2', 175.0, 19.9],
		['encoder.3', 206.0, 19.9],
		['encoder.4', 237.0, 19.9],
		['key.sample', 260.2, 12.1],
		['key.com', 260.2, 27.7],
		['key.instrument', 12.2, 43.2],
		['key.mix', 58.7, 43.2],
		['key.m1', 74.2, 43.2],
		['key.m4', 120.7, 43.2],
		['track.1', 136.2, 43.2],
		['track.8', 244.7, 43.2],
		['key.player', 260.2, 43.2],
		['step.1', 12.2, 58.7],
		['step.16', 244.7, 58.7],
		['key.bar', 260.2, 58.7],
		['key.record', 12.2, 74.2],
		['key.stop', 43.2, 74.2],
		['keyboard.fs3', 66.4, 74.2],
		['keyboard.gs3', 81.9, 74.2],
		['keyboard.as3', 97.4, 74.2],
		['keyboard.cs4', 128.5, 74.2],
		['keyboard.ds4', 144.0, 74.2],
		['keyboard.fs4', 175.0, 74.2],
		['keyboard.gs4', 190.5, 74.2],
		['keyboard.as4', 206.0, 74.2],
		['keyboard.cs5', 237.0, 74.2],
		['keyboard.ds5', 252.5, 74.2],
		['key.minus', 12.2, 89.7],
		['key.shift', 43.2, 89.7],
		['keyboard.f3', 58.7, 89.7],
		['keyboard.c4', 120.7, 89.7],
		['keyboard.e5', 260.2, 89.7],
		['mic.internal', 276.6, 12.2]
	];

	it.each(documented)('%s sits where the research note measured it', (id, x, y) => {
		const { center } = getControl(id).geometry;
		expect(close(center.x, x, 0.15) && close(center.y, y, 0.15)).toBe(true);
	});

	it('draws LED windows 3.05 mm behind the keycap centre', () => {
		expect(ledCenter(getControl('step.1'))).toEqual({ x: 12.16, y: 58.64 - 3.05 });
		expect(ledCenter(getControl('key.shift'))).toBeNull();
		expect(ledCenter(getControl('encoder.1'))).toBeNull();
	});

	it('insets visible tiles by half the tile gap', () => {
		const tile = visibleTileRect(getControl('key.shift'));
		expect(close(tile.w, PANEL.grid.tileSize)).toBe(true);
		expect(close(tile.x, getControl('key.shift').geometry.rect.x + 0.45)).toBe(true);
		expect(visibleTileRect(getControl('mic.internal'))).toEqual(
			getControl('mic.internal').geometry.rect
		);
	});
});

describe('colours and legends', () => {
	it('tints step pairs with the 8-tone ramp, dark to light', () => {
		const tokens = controlsInGroup('step').map((s) => s.colors.cap);
		expect(tokens).toEqual(
			Array.from({ length: 16 }, (_, i) => `step-ramp-${Math.floor(i / 2) + 1}`)
		);
		const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16);
		const ramp = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => lightness(colorHex(`step-ramp-${n}`)));
		expect([...ramp].sort((a, b) => a - b)).toEqual(ramp);
	});

	it('gives the four encoders dark → white caps', () => {
		expect(controlsOfKind('encoder').map((e) => e.colors.cap)).toEqual([
			'encoder-cap-dark',
			'encoder-cap-mid',
			'encoder-cap-light',
			'encoder-cap-white'
		]);
		expect(colorHex('encoder-cap-dark')).toBe('#45484c');
		expect(() => colorHex('nope')).toThrow(UnknownControlError);
	});

	it('describes a printed legend for every key except the blank step caps', () => {
		for (const key of KEYS) {
			if (key.group === 'step') expect(key.legend.printed).toBeNull();
			else expect(key.legend.printed, key.id).toBeTruthy();
		}
		expect(getControl('key.record').colors.legend).toBe('legend-red');
		expect(Object.keys(COLOR_TOKENS).length).toBeGreaterThan(30);
	});

	it('links controls to the guide section that introduces them', () => {
		expect(guideUrl(getControl('key.shift'))).toBe(
			'https://teenage.engineering/guides/op-xy/layout#transport-controls'
		);
		expect(guideUrl(getControl('marking.tick'))).toBeNull();
	});
});

describe('lookups', () => {
	it.each([
		['key.shift', 'key.shift'],
		['Shift', 'key.shift'],
		['shift key', 'key.shift'],
		['dark gray knob', 'encoder.1'],
		['white encoder', 'encoder.4'],
		['Mixer', 'key.mix'],
		['T3', 'track.3'],
		['brain', 'track.1'],
		['FX II', 'track.8'],
		['step 12', 'step.12'],
		['natural 1', 'keyboard.f3'],
		['accidental 0', 'keyboard.ds5'],
		['key F#3', 'keyboard.fs3'],
		['line in', 'port.lineIn'],
		['display', 'screen.main'],
		['play button', 'key.play']
	])('finds %s', (name, id) => {
		expect(findControl(name)?.id).toBe(id);
		expect(resolveControl(name).id).toBe(id);
	});

	it('suggests the closest name for typos', () => {
		expect(findControl('shfit')).toBeUndefined();
		expect(() => resolveControl('shfit')).toThrow(/did you mean "shift"/);
		expect(() => resolveControl('zzzzzzzz')).toThrow(UnknownControlError);
	});

	it('guards runtime strings', () => {
		expect(isControlId('encoder.4')).toBe(true);
		expect(isControlId('encoder.5')).toBe(false);
		expect(isControlId(42)).toBe(false);
		expect(() => getControl('key.nope' as ControlId)).toThrow(UnknownControlError);
	});
});
