import { describe, expect, it } from 'vitest';
import { parseKeys } from '$lib/core/opxy';
import { DEFAULT_TIMING, planAnimation, type PlanStep } from './animation';

const T = DEFAULT_TIMING;

/** Press/release/turn steps as compact strings, e.g. "0 press key.shift". */
const actions = (steps: readonly PlanStep[]) =>
	steps
		.filter((s) => s.kind === 'press' || s.kind === 'release' || s.kind === 'turn')
		.map((s) => `${s.at} ${s.kind} ${'id' in s ? s.id : ''}`);

describe('planAnimation', () => {
	it('holds shift, taps M1, then lets shift up', () => {
		const plan = planAnimation(parseKeys('shift + M1'));
		expect(actions(plan.steps)).toEqual([
			'0 press key.shift',
			`${T.staggerMs} press key.m1`,
			`${T.staggerMs + T.pressMs} release key.m1`,
			`${T.staggerMs + T.pressMs + T.releaseMs} release key.shift`
		]);
		expect(plan.ids).toEqual(['key.shift', 'key.m1']);
		expect(plan.steps.at(-1)).toEqual({ at: plan.duration, kind: 'clear' });
		expect(plan.duration).toBe(T.staggerMs + T.pressMs + T.releaseMs + T.lingerMs);
	});

	it('marks held keys "hold" and the tapped key "press"', () => {
		const plan = planAnimation(parseKeys('shift + M1'));
		const marks = plan.steps.filter((s) => s.kind === 'highlight');
		expect(marks).toEqual([
			{ at: 0, kind: 'highlight', id: 'key.shift', highlight: 'hold' },
			{ at: T.staggerMs, kind: 'highlight', id: 'key.m1', highlight: 'press' }
		]);
	});

	it('turns an encoder detent by detent while a step is held', () => {
		const plan = planAnimation(parseKeys('step 5 + turn E2'), { turnSteps: 3, direction: -1 });
		expect(actions(plan.steps)).toEqual([
			'0 press step.5',
			`${T.staggerMs + T.turnStepMs} turn encoder.2`,
			`${T.staggerMs + 2 * T.turnStepMs} turn encoder.2`,
			`${T.staggerMs + 3 * T.turnStepMs} turn encoder.2`,
			`${T.staggerMs + 3 * T.turnStepMs + T.releaseMs} release step.5`
		]);
		const turns = plan.steps.filter((s) => s.kind === 'turn');
		expect(turns.every((s) => s.kind === 'turn' && s.delta === -1)).toBe(true);
		const hints = plan.steps.filter((s) => s.kind === 'hint');
		expect(hints.map((s) => (s.kind === 'hint' ? s.direction : null))).toEqual([-1, 0]);
	});

	it('plays chords one after another, releasing in between', () => {
		const plan = planAnimation(parseKeys('record + play → play'));
		const chord1End = T.staggerMs + T.pressMs + T.releaseMs;
		const chord2 = chord1End + T.gapMs;
		expect(actions(plan.steps)).toEqual([
			'0 press key.record',
			`${T.staggerMs} press key.play`,
			`${T.staggerMs + T.pressMs} release key.play`,
			`${chord1End} release key.record`,
			`${chord2} press key.play`,
			`${chord2 + T.pressMs} release key.play`
		]);
	});

	it('keeps held keys down across "→ +"', () => {
		const plan = planAnimation(parseKeys('shift + step 1 → + step 2'));
		const list = actions(plan.steps);
		expect(list.indexOf('0 press key.shift')).toBe(0);
		// shift comes up only after step 2 was tapped
		const shiftUp = list.findIndex((a) => a.endsWith('release key.shift'));
		const step2Up = list.findIndex((a) => a.endsWith('release step.2'));
		expect(shiftUp).toBeGreaterThan(step2Up);
		expect(list.filter((a) => a.includes('key.shift'))).toHaveLength(2);
	});

	it('holds a key for holdMs when written "hold"', () => {
		const plan = planAnimation(parseKeys('hold M1'), { holdMs: 1500 });
		expect(actions(plan.steps)).toEqual(['0 press key.m1', '1500 release key.m1']);
		expect(plan.steps[0]).toEqual({ at: 0, kind: 'highlight', id: 'key.m1', highlight: 'hold' });
	});

	it('pushes an encoder for a click, and lets it go as a click (so the simulator takes it)', () => {
		const plan = planAnimation(parseKeys('click E3'));
		expect(actions(plan.steps)).toEqual(['0 press encoder.3', `${T.pressMs} release encoder.3`]);
		expect(plan.steps).toContainEqual({ at: T.pressMs, kind: 'click', id: 'encoder.3' });
		// a held push around a turn is no click
		const held = planAnimation(parseKeys('click E1 + turn E2')).steps;
		expect(held.some((s) => s.kind === 'click')).toBe(false);
	});

	it('shows one stand-in for a placeholder and marks the others as candidates', () => {
		const plan = planAnimation(parseKeys('shift + step n'));
		expect(actions(plan.steps)).toContain(`${T.staggerMs} press step.1`);
		const candidates = plan.steps.filter(
			(s) => s.kind === 'highlight' && s.highlight === 'candidate'
		);
		expect(candidates).toHaveLength(15);
	});

	it('lets the caller pick the stand-in', () => {
		const plan = planAnimation(parseKeys('bar + step n'), {}, (ids) => ids[ids.length - 1]);
		expect(actions(plan.steps)).toContain(`${T.staggerMs} press step.16`);
		expect(() => planAnimation(parseKeys('bar + step n'), {}, () => 'key.m1')).toThrow(RangeError);
	});

	it('only highlights controls that cannot be pushed', () => {
		const plan = planAnimation(parseKeys('power'));
		expect(actions(plan.steps)).toEqual([]);
		expect(plan.steps[0]).toMatchObject({ kind: 'highlight', id: 'switch.power' });
	});

	it('turns the volume knob and presses the pitch-bend pad', () => {
		expect(actions(planAnimation(parseKeys('turn volume'), { turnSteps: 2 }).steps)).toEqual([
			`${T.turnStepMs} turn knob.volume`,
			`${2 * T.turnStepMs} turn knob.volume`
		]);
		expect(actions(planAnimation(parseKeys('pitchbend')).steps)).toEqual([
			'0 press strip.pitchbend',
			`${T.pressMs} release strip.pitchbend`
		]);
	});

	it('keeps steps in time order and rejects bad timing', () => {
		const plan = planAnimation(parseKeys('shift + step 3 → + step 4 → play'));
		for (let i = 1; i < plan.steps.length; i++) {
			expect(plan.steps[i].at).toBeGreaterThanOrEqual(plan.steps[i - 1].at);
		}
		expect(() => planAnimation(parseKeys('M1'), { pressMs: -1 })).toThrow(RangeError);
		expect(() => planAnimation(parseKeys('M1'), { turnSteps: 0 })).toThrow(RangeError);
	});
});
