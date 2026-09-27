/**
 * Drives a virtual OP-XY the way a person does, for the conformance tests: presses held for real
 * durations, the computer's Shift key, encoders, time passing. Reads back what a person sees (LED
 * windows, the screen) and, for exact checks, the model behind them.
 *
 * Two implementations run the same tests (`src/lib/sim/conformance/`):
 * - {@link SimDriver}: the bare simulator on a manual clock (Node, fast);
 * - `AppDriver` (`src/lib/app/testing/app-driver.ts`): the app itself in a browser, the rendered
 *   replica clicked with pointer events and the LEDs read from the page.
 */
import type { KeyLedState } from '$lib/replica/state.svelte';
import { OpxySim } from '../opxy-sim.svelte';
import type { SimState } from '../params';
import type { ScreenFrame } from '../screen/frame';
import { describeFrame } from '../screen/render';

/** How long a mouse click holds a key down (a quick, ordinary click). */
export const CLICK_MS = 110;
/** A deliberate click, pressed and let go without hurry. */
export const SLOW_CLICK_MS = 350;
/** Time between two clicks in a row. */
export const GAP_MS = 60;
/** A press long enough to count as holding a key. */
export const HOLD_MS = 900;
/** One animation frame. */
export const FRAME_MS = 16;

/** The 24 keyboard keys, left to right (F3…E5). */
export const KEYBOARD = [
	'f3',
	'fs3',
	'g3',
	'gs3',
	'a3',
	'as3',
	'b3',
	'c4',
	'cs4',
	'd4',
	'ds4',
	'e4',
	'f4',
	'fs4',
	'g4',
	'gs4',
	'a4',
	'as4',
	'b4',
	'c5',
	'cs5',
	'd5',
	'ds5',
	'e5'
] as const;

/** The 14 white keys: step component `natural n` (1–14). */
export const NATURALS = KEYBOARD.filter((k) => !k.includes('s'));
/** The 10 black keys: digits 1–9, then 0. */
export const ACCIDENTALS = KEYBOARD.filter((k) => k.includes('s'));

/** The control id of `natural n` (1–14). */
export const natural = (n: number) => `keyboard.${NATURALS[n - 1]}`;
/** The control id of the black key for `digit` (1–9, 0). */
export const accidental = (digit: number) => `keyboard.${ACCIDENTALS[(digit + 9) % 10]}`;
/** MIDI note of a keyboard key at the keyboard's home octave (F3 = 53). */
export const noteOf = (key: string) => 53 + KEYBOARD.indexOf(key as (typeof KEYBOARD)[number]);

/** A virtual OP-XY under test. Every action is async: the app's needs real events and frames. */
export interface Driver {
	/** A click: down, held `ms` (default {@link CLICK_MS}), up, then a short gap. */
	click(id: string, ms?: number): Promise<void>;
	/** Clicks each control in turn. */
	clicks(...ids: string[]): Promise<void>;
	/** Puts a key (or an encoder's push) down and keeps it there. */
	down(id: string): Promise<void>;
	/** Lets it come up. */
	up(id: string): Promise<void>;
	/** Keeps `id` down while `during` runs. */
	holding(id: string, during: () => Promise<void>): Promise<void>;
	/** Keeps the computer's Shift key down while `during` runs. */
	withShift(during: () => Promise<void>): Promise<void>;
	/**
	 * Turns encoder 1–4 by whole detents (positive = clockwise); `fine` turns it pushed in (the
	 * device's push-turn, alt-drag on the replica).
	 */
	turn(encoder: number, detents: number, options?: { fine?: boolean }): Promise<void>;
	/** Pushes and releases encoder 1–4 without turning it. */
	push(encoder: number): Promise<void>;
	/** Lets time pass: the timers run, and a playing transport moves. */
	wait(ms: number): Promise<void>;

	/** One key's LED window now. */
	led(id: string): KeyLedState;
	/** Step keys 1–16: `.` off, `d` dim, `w` white, `r` red. */
	steps(): string;
	/** Keyboard keys lit, by name ("f3", "cs4" …). */
	lit(): string[];
	/** What the screen says (its description for screen readers). */
	screen(): string;
	readonly frame: ScreenFrame;
	/** The simulator's state, for exact checks of what the LEDs summarise. */
	readonly state: SimState;
}

const LED_CHAR: Record<KeyLedState, string> = { off: '.', dim: 'd', white: 'w', red: 'r' };

/** The step row as {@link Driver.steps} spells it. */
export function stepRow(led: (id: string) => KeyLedState): string {
	return Array.from({ length: 16 }, (_, i) => LED_CHAR[led(`step.${i + 1}`)]).join('');
}

/** The lit keyboard keys as {@link Driver.lit} lists them. */
export function litKeys(led: (id: string) => KeyLedState): string[] {
	return KEYBOARD.filter((k) => led(`keyboard.${k}`) === 'white');
}

/** Shared action helpers on top of down / up / wait. */
export abstract class BaseDriver implements Driver {
	abstract down(id: string): Promise<void>;
	abstract up(id: string): Promise<void>;
	abstract wait(ms: number): Promise<void>;
	abstract turn(encoder: number, detents: number, options?: { fine?: boolean }): Promise<void>;
	abstract push(encoder: number): Promise<void>;
	abstract led(id: string): KeyLedState;
	abstract screen(): string;
	abstract readonly frame: ScreenFrame;
	abstract readonly state: SimState;
	protected abstract shiftKey(down: boolean): Promise<void>;

	async click(id: string, ms = CLICK_MS): Promise<void> {
		await this.down(id);
		await this.wait(ms);
		await this.up(id);
		await this.wait(GAP_MS);
	}

	async clicks(...ids: string[]): Promise<void> {
		for (const id of ids) await this.click(id);
	}

	async holding(id: string, during: () => Promise<void>): Promise<void> {
		await this.down(id);
		await this.wait(GAP_MS);
		try {
			await during();
		} finally {
			await this.up(id);
			await this.wait(GAP_MS);
		}
	}

	async withShift(during: () => Promise<void>): Promise<void> {
		await this.shiftKey(true);
		await this.wait(GAP_MS);
		try {
			await during();
		} finally {
			await this.shiftKey(false);
			await this.wait(GAP_MS);
		}
	}

	steps(): string {
		return stepRow((id) => this.led(id));
	}

	lit(): string[] {
		return litKeys((id) => this.led(id));
	}
}

/** The bare simulator on a manual clock, advanced in animation frames like the app's. */
export class SimDriver extends BaseDriver {
	#t = 1000;
	readonly sim = new OpxySim({ now: () => this.#t });

	get frame(): ScreenFrame {
		return this.sim.frame;
	}

	get state(): SimState {
		return this.sim.state;
	}

	async down(id: string): Promise<void> {
		this.sim.input({ type: 'press', id });
	}

	async up(id: string): Promise<void> {
		this.sim.input({ type: 'release', id });
	}

	protected async shiftKey(down: boolean): Promise<void> {
		this.sim.input({ type: down ? 'press' : 'release', id: 'key.shift' });
	}

	async turn(encoder: number, detents: number, { fine = false } = {}): Promise<void> {
		const id = `encoder.${encoder}`;
		if (fine) this.sim.input({ type: 'press', id });
		this.sim.input({ type: 'turn', id, delta: detents, fine });
		if (fine) this.sim.input({ type: 'release', id });
	}

	async push(encoder: number): Promise<void> {
		const id = `encoder.${encoder}`;
		this.sim.input({ type: 'press', id });
		this.sim.input({ type: 'release', id });
		this.sim.input({ type: 'click', id });
	}

	async wait(ms: number): Promise<void> {
		for (let left = ms; left > 0; left -= FRAME_MS) {
			const dt = Math.min(FRAME_MS, left);
			this.#t += dt;
			this.sim.advance(dt);
		}
	}

	led(id: string): KeyLedState {
		return (this.sim.leds as Record<string, KeyLedState | undefined>)[id] ?? 'off';
	}

	screen(): string {
		return describeFrame(this.sim.frame);
	}
}
