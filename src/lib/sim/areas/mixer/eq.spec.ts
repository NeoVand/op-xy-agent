import { describe, expect, it } from 'vitest';
import {
	EQ_PANELS,
	FLOOR,
	HEIGHT,
	eqTilts,
	floorAt,
	floorPoint,
	knobTravel,
	panelOutline,
	panelShadow,
	shownBands
} from './eq';

/** Distance between two screen points. */
const gap = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('the EQ scene: floor and panels (camera frames steps-018…033)', () => {
	it('projects floor cells as 30 × 20 px rhombi, and back', () => {
		expect(floorPoint(0, 0)).toEqual([FLOOR.x, FLOOR.y]);
		const [x, y] = floorPoint(1, 1);
		expect(x - FLOOR.x).toBeCloseTo(29.9, 1);
		expect(y - FLOOR.y).toBeCloseTo(0, 1);
		expect(floorPoint(2, 3, 1)[1]).toBeCloseTo(floorPoint(2, 3)[1] - HEIGHT, 9);
		const [u, v] = floorAt(...floorPoint(-3.25, 12.5));
		expect(u).toBeCloseTo(-3.25, 9);
		expect(v).toBeCloseTo(12.5, 9);
	});

	it('has two low, four mid and eight high panels, each row eight cells deep, back to front', () => {
		expect(EQ_PANELS.map((p) => p.band).sort()).toEqual([
			...Array(2).fill(0),
			...Array(4).fill(1),
			...Array(8).fill(2)
		]);
		for (const band of [0, 1, 2]) {
			const row = EQ_PANELS.filter((p) => p.band === band);
			expect(row.reduce((sum, p) => sum + p.depth, 0)).toBe(8);
			expect(Math.min(...row.map((p) => p.hinge - p.depth))).toBe(8);
			expect(Math.max(...row.map((p) => p.hinge))).toBe(16);
		}
		EQ_PANELS.slice(1).forEach((p, i) => {
			const q = EQ_PANELS[i];
			expect(q.hinge < p.hinge || (q.hinge === p.hinge && q.u0 > p.u0)).toBe(true);
		});
	});

	it('lies flat on its black footprint at a full cut and leans back 60° at a full boost', () => {
		const front = EQ_PANELS[EQ_PANELS.length - 1]; // the near low panel, hinged at v 16
		expect(front).toMatchObject({ band: 0, hinge: 16, depth: 4 });
		expect(panelOutline(front, 0)).toEqual(panelShadow(front));
		// the device's free corners at CC 127 (steps-022): (166.0, 111.0) and (223.5, 71.8)
		const [, , right, left] = panelOutline(front, 1);
		expect(gap(left, [166.0, 111.0])).toBeLessThan(2.5);
		expect(gap(right, [223.5, 71.8])).toBeLessThan(2.5);
		// and the footprint's far edge stays where the flat panel's was (v 12)
		expect(floorAt(...panelShadow(front)[3])[1]).toBeCloseTo(12, 9);
	});
});

describe('the EQ scene: bands, E4 and the knob (frames steps-019…033, b1-136…170)', () => {
	it('leans each row with its band, half way when the EQ is flat', () => {
		expect(eqTilts([0, 0, 0], 0)).toEqual([0.5, 0.5, 0.5]);
		expect(eqTilts([-1, 1, 0.5], 0)).toEqual([0, 1, 0.75]);
	});

	it('bends the rows with E4 toward lows and highs flat and mids steepest', () => {
		expect(shownBands([0, 0, 0], 0.5)).toEqual([-0.5, 0.5, -0.5]);
		expect(eqTilts([1, -1, 1], 1)).toEqual([0, 1, 0]);
	});

	it('moves the knob by how far the shown bands are from flat', () => {
		expect(knobTravel([0, 0, 0], 0)).toBe(0);
		expect(knobTravel([1, 0, 0], 0)).toBeCloseTo(1 / 3, 9);
		expect(knobTravel([0, -0.5, 0], 0)).toBeCloseTo(1 / 6, 9);
		expect(knobTravel([0, 0, 0], 0.4)).toBeCloseTo(0.4, 9);
		expect(knobTravel([0, 0, 0], 1)).toBe(1);
		expect(knobTravel([1, -1, 1], 0)).toBe(1);
	});
});
