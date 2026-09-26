import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTROLS, KEYS, PANEL, controlsOfKind, getControl, type KeyId } from '$lib/core/opxy';
import {
	ART_SOURCE,
	ENCODER_ART,
	GRILLE_ART,
	GUIDE_ART,
	KEY_ART,
	PANEL_ART,
	SCREEN_ART,
	VOLUME_ART
} from './art.generated';
import type { ArtBox } from './art.types';

const ROOT = path.resolve(import.meta.dirname, '../../..');

interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/**
 * Bounds of the path data the build emits (M H V L C Z, absolute, implicit repeats). Control
 * points are included, so the box is conservative.
 */
function pathBox(d: string): Box {
	const tokens = d.match(/[MHVLCZ]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
	expect(tokens.join('').length).toBeGreaterThan(0);
	const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
	const add = (x: number, y: number) => {
		box.x0 = Math.min(box.x0, x);
		box.y0 = Math.min(box.y0, y);
		box.x1 = Math.max(box.x1, x);
		box.y1 = Math.max(box.y1, y);
	};
	let cmd = '';
	let x = 0;
	let y = 0;
	let i = 0;
	const num = () => {
		const t = tokens[i++];
		if (t === undefined || /[A-Z]/.test(t)) throw new Error(`bad path data: ${d}`);
		return Number(t);
	};
	while (i < tokens.length) {
		if (/[A-Z]/.test(tokens[i])) cmd = tokens[i++];
		switch (cmd) {
			case 'M':
			case 'L':
				x = num();
				y = num();
				add(x, y);
				if (cmd === 'M') cmd = 'L';
				break;
			case 'H':
				x = num();
				add(x, y);
				break;
			case 'V':
				y = num();
				add(x, y);
				break;
			case 'C':
				for (let k = 0; k < 3; k++) {
					x = num();
					y = num();
					add(x, y);
				}
				break;
			case 'Z':
				break;
			default:
				throw new Error(`unexpected command ${cmd} in ${d}`);
		}
	}
	return box;
}

const shift = (b: Box, dx: number, dy: number): Box => ({
	x0: b.x0 + dx,
	y0: b.y0 + dy,
	x1: b.x1 + dx,
	y1: b.y1 + dy
});
const fromArt = (b: ArtBox): Box => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h });
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every piece of emitted artwork, in panel millimetres. */
function emittedBoxes(): { what: string; box: Box }[] {
	const out: { what: string; box: Box }[] = [];
	for (const key of KEYS) {
		const art = KEY_ART[key.id as KeyId];
		const cx = key.geometry.center.x + art.offset.x;
		const cy = key.geometry.center.y + art.offset.y;
		art.legend.forEach((p, k) =>
			out.push({ what: `${key.id} legend ${k}`, box: shift(pathBox(p.d), cx, cy) })
		);
	}
	out.push({ what: 'power switch', box: pathBox(PANEL_ART.powerSwitch.d) });
	out.push({ what: 'pitch bend', box: pathBox(PANEL_ART.pitchBend.d) });
	out.push({ what: 'tick', box: fromArt(PANEL_ART.tick) });
	const { mic, meter } = PANEL_ART;
	out.push({
		what: 'mic',
		box: { x0: mic.x - mic.r, y0: mic.y - mic.r, x1: mic.x + mic.r, y1: mic.y + mic.r }
	});
	out.push({ what: 'meter', box: { x0: meter.x, y0: meter.y1, x1: meter.x, y1: meter.y2 } });
	out.push({ what: 'junctions', box: pathBox(GUIDE_ART.junctions) });
	out.push({ what: 'frame', box: pathBox(GUIDE_ART.frame) });
	return out;
}

describe('replica art (generated from the TE layout drawing)', () => {
	it('accounts for every path of the drawing', () => {
		const assigned = Object.values(ART_SOURCE.coverage.assigned).reduce((a, b) => a + b, 0);
		expect(assigned + ART_SOURCE.duplicates).toBe(ART_SOURCE.paths);
		expect(ART_SOURCE.paths).toBe(588);
		expect(ART_SOURCE.coverage.unassigned).toEqual([]);
		expect(ART_SOURCE.coverage.assigned).toMatchObject({
			keycap: 68,
			led: 48,
			tile: 75,
			'grille-hole': 147,
			dish: 4,
			top: 4,
			cap: 4
		});
	});

	it('gives each of the 68 keys and 4 encoders legend art or marks it legend-less', () => {
		expect(Object.keys(KEY_ART)).toHaveLength(68);
		for (const key of KEYS) {
			const art = KEY_ART[key.id as KeyId];
			expect(art, key.id).toBeDefined();
			expect(art.legendless, key.id).toBe(art.legend.length === 0);
			// TE prints a legend exactly on the keys controls.json describes one for
			expect(art.legendless, key.id).toBe(key.legend.glyph === null);
		}
		const legendless = KEYS.filter((k) => KEY_ART[k.id as KeyId].legendless).map((k) => k.id);
		expect(legendless).toEqual(Array.from({ length: 16 }, (_, i) => `step.${i + 1}`));

		const encoders = controlsOfKind('encoder');
		expect(encoders.map((e) => e.id)).toEqual(Object.keys(ENCODER_ART));
		for (const e of encoders)
			expect(ENCODER_ART[e.id as keyof typeof ENCODER_ART].legendless).toBe(true);
		expect(ART_SOURCE.coverage.legendless).toEqual([...legendless, ...encoders.map((e) => e.id)]);
		expect(ART_SOURCE.coverage.legendKeys).toBe(52);
	});

	it('keeps legends on their own key: inside the tile, cap art inside the cap', () => {
		for (const key of KEYS) {
			const art = KEY_ART[key.id as KeyId];
			const t = art.tile;
			for (const p of art.legend) {
				expect(p.d).toMatch(/^M[-\d.MHVLCZ ]+$/);
				const b = pathBox(p.d);
				expect(b.x0, key.id).toBeGreaterThanOrEqual(t.x);
				expect(b.y0, key.id).toBeGreaterThanOrEqual(t.y);
				expect(b.x1, key.id).toBeLessThanOrEqual(t.x + t.w);
				expect(b.y1, key.id).toBeLessThanOrEqual(t.y + t.h);
				if (p.part === 'cap') {
					const r = art.capRadius;
					expect(Math.max(-b.x0, b.x1, -b.y0, b.y1), key.id).toBeLessThan(r);
				}
			}
		}
		// the only print on a tile rather than a cap is "num" on the first accidental
		const tilePrints = KEYS.filter((k) =>
			KEY_ART[k.id as KeyId].legend.some((p) => p.part === 'tile')
		);
		expect(tilePrints.map((k) => k.id)).toEqual(['keyboard.fs3']);
	});

	it('strips the wordmarks: nothing emitted overlaps the removed logo paths', () => {
		const { stripped } = ART_SOURCE.coverage;
		expect(stripped).toHaveLength(5);
		for (const s of stripped) {
			// all in the right margin, below the level meter
			expect(s.box.x).toBeGreaterThan(270);
			expect(s.box.y).toBeGreaterThan(PANEL_ART.meter.y2);
		}
		const logo = stripped.map((s) => fromArt(s.box));
		for (const { what, box } of emittedBoxes()) {
			for (const l of logo) expect(overlaps(box, l), `${what} overlaps the logo`).toBe(false);
		}
	});

	it('fits the drawing to controls.json within a tenth of a millimetre', () => {
		const { transform, residual, bodyTransform } = ART_SOURCE;
		expect(residual.rms).toBeLessThan(0.05);
		expect(residual.max).toBeLessThan(0.2);
		// uniform scale ≈ 0.3896 mm per drawing unit, the same from the body outline
		expect(transform.x[0]).toBeCloseTo(0.38957, 4);
		expect(Math.abs(transform.x[0] - transform.y[0]) / transform.x[0]).toBeLessThan(0.001);
		expect(bodyTransform.x[0]).toBeCloseTo(transform.x[0], 4);
		// drawn control centres (centre + offset) match controls.json to within the residual
		for (const key of KEYS) {
			const { offset } = KEY_ART[key.id as KeyId];
			expect(Math.hypot(offset.x, offset.y), key.id).toBeLessThan(0.05);
		}
		expect(Math.hypot(VOLUME_ART.offset.x, VOLUME_ART.offset.y)).toBeLessThanOrEqual(residual.max);
	});

	it('measures the parts the way controls.json describes them', () => {
		const m = ART_SOURCE.measured;
		expect(m.keycapDiameter).toBeCloseTo(PANEL.keycap.diameter, 1);
		expect(m.ledDiameter).toBeCloseTo(PANEL.ledWindow.diameter, 1);
		expect(m.tileCornerRadius).toBeCloseTo(PANEL.grid.tileCornerRadius, 2);
		expect(m.bodyCornerRadius).toBeCloseTo(PANEL.body.cornerRadius, 2);
		expect(Math.abs(m.ledOffset[1] - PANEL.ledWindow.offset.y)).toBeLessThan(0.15);
		for (const e of Object.values(ENCODER_ART)) {
			const shape = getControl('encoder.1').geometry.shape;
			if (shape.type !== 'encoder') throw new Error('encoder shape');
			expect(e.dish * 2).toBeCloseTo(shape.dishDiameter, 1);
			expect(e.top * 2).toBeCloseTo(shape.topDiameter, 1);
			expect(e.cap * 2).toBeCloseTo(shape.capDiameter, 0);
		}
		expect(SCREEN_ART.tile.w).toBeCloseTo(62, 0);
		expect(SCREEN_ART.tile.h).toBeCloseTo(31, 0);
	});

	it('puts an LED window on exactly the 48 keys that have one', () => {
		const withLed = KEYS.filter((k) => KEY_ART[k.id as KeyId].led !== null).map((k) => k.id);
		expect(withLed).toEqual(KEYS.filter((k) => k.led !== null).map((k) => k.id));
		expect(withLed).toHaveLength(48);
	});

	it('draws the 147-hole speaker grille row by row inside its circle', () => {
		const shape = getControl('speaker.internal').geometry.shape;
		if (shape.type !== 'grille') throw new Error('speaker shape');
		expect(GRILLE_ART.holes).toHaveLength(shape.holes);
		expect(GRILLE_ART.rows).toEqual(shape.rowCounts);
		expect(GRILLE_ART.pitch).toBeCloseTo(shape.pitch, 1);
		expect(GRILLE_ART.holeRadius * 2).toBeCloseTo(shape.holeDiameter, 1);
		// The pattern is a rounded square of rows (5, 11, 11, 13 × 7, 11, 11, 7) about as wide as
		// controls.json's nominal Ø25, centred on the speaker tile.
		for (const [x, y] of GRILLE_ART.holes) {
			expect(Math.max(Math.abs(x), Math.abs(y)) + GRILLE_ART.holeRadius).toBeLessThan(
				shape.diameter / 2 + 0.2
			);
		}
		const meanOf = (k: 0 | 1) =>
			GRILLE_ART.holes.reduce((s, h) => s + h[k], 0) / GRILLE_ART.holes.length;
		expect(Math.abs(meanOf(0))).toBeLessThan(0.1);
		expect(Math.abs(meanOf(1))).toBeLessThan(0.25);
	});

	it('places the body-margin features where controls.json has them', () => {
		const near = (id: string, x: number, y: number, tol = 0.3) => {
			const c = CONTROLS.find((k) => k.id === id);
			expect(c, id).toBeDefined();
			if (!c) return;
			const r = c.geometry.rect;
			const inside =
				x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol;
			expect(inside, `${id} at ${x}, ${y}`).toBe(true);
		};
		near('mic.internal', PANEL_ART.mic.x, PANEL_ART.mic.y);
		near('meter.level', PANEL_ART.meter.x, (PANEL_ART.meter.y1 + PANEL_ART.meter.y2) / 2);
		expect(PANEL_ART.powerSwitch.box.x).toBeCloseTo(PANEL.body.width, 1);
		expect(PANEL_ART.powerSwitch.box.w).toBeCloseTo(3, 1);
		expect(PANEL_ART.pitchBend.box.y).toBeCloseTo(PANEL.body.height, 1);
		const bend = getControl('strip.pitchbend').geometry.rect;
		expect(PANEL_ART.pitchBend.box.x).toBeCloseTo(bend.x, 0);
		expect(PANEL_ART.pitchBend.box.w).toBeCloseTo(bend.w, 0);
		expect(PANEL_ART.tick.x + PANEL_ART.tick.w / 2).toBeCloseTo(
			getControl('marking.tick').geometry.center.x,
			0
		);
	});

	const source = path.join(ROOT, ART_SOURCE.file);
	it.skipIf(!existsSync(source))('is up to date with the drawing (research input present)', () => {
		const out = execFileSync(
			process.execPath,
			['scripts/build-replica-art.mjs', '--check', '--quiet'],
			{
				cwd: ROOT,
				encoding: 'utf8'
			}
		);
		expect(out).toMatch(/up to date/);
	});
});
