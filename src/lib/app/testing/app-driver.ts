/**
 * The conformance tests' driver for the app itself (browser tests only; see
 * `src/lib/sim/testing/driver.ts`): the replica rendered and wired to an `AppSimulator` as the
 * app wires them, clicked with pointer events, Shift held with key events on the window, encoders
 * turned with the wheel, and every LED read from the page. Time is a {@link FakeTime}: the app's
 * page clock and animation frames run only as a test lets time pass, so tests are exact.
 */
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { ReplicaState, type KeyLedState } from '$lib/replica';
import { DRAG_PX_PER_STEP, WHEEL_PX_PER_STEP } from '$lib/replica/input';
import type { SimState } from '$lib/sim/params';
import type { ScreenFrame } from '$lib/sim/screen/frame';
import { describeFrame } from '$lib/sim/screen/render';
import { BaseDriver, FRAME_MS } from '$lib/sim/testing/driver';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { AppSimulator, type FrameClock } from '../simulator.svelte';
import AppHarness from './AppHarness.svelte';

/** Wheel travel and drag distance per encoder detent (the replica's input helpers). */
const WHEEL_PX = WHEEL_PX_PER_STEP;
const DRAG_PX = DRAG_PX_PER_STEP;

export class AppDriver extends BaseDriver {
	readonly time = new FakeTime();
	readonly replica = new ReplicaState({ timers: this.time });
	readonly simulator: AppSimulator;
	readonly #unmount: () => void;
	readonly #stop: () => void;
	/** Pointer ids of controls held down, so the release matches its press. */
	readonly #pointers = new Map<string, number>();
	#nextPointer = 1;

	private constructor() {
		super();
		const time = this.time;
		const frames: FrameClock = {
			request: (callback) => time.setTimeout(() => callback(time.now()), FRAME_MS),
			cancel: (handle) => time.clearTimeout(handle),
			now: () => time.now()
		};
		this.simulator = new AppSimulator({ replica: this.replica, stack: null, frames });
		const screen = render(AppHarness, { replica: this.replica, simulator: this.simulator });
		this.#unmount = () => screen.unmount();
		this.#stop = this.simulator.start();
		flushSync();
	}

	/** The app on a fresh page. */
	static async start(): Promise<AppDriver> {
		return new AppDriver();
	}

	/** Takes the page down. */
	dispose(): void {
		this.#stop();
		this.#unmount();
	}

	get frame(): ScreenFrame {
		return this.simulator.frame;
	}

	get state(): SimState {
		return this.simulator.sim.state;
	}

	#element(id: string): Element {
		const element = document.querySelector(`[data-id="${id}"]`);
		if (!element) throw new Error(`the replica has no control "${id}"`);
		return element;
	}

	#pointer(type: 'pointerdown' | 'pointerup', element: Element, pointerId: number): void {
		const box = element.getBoundingClientRect();
		element.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				pointerId,
				isPrimary: true,
				button: 0,
				buttons: type === 'pointerdown' ? 1 : 0,
				clientX: box.x + box.width / 2,
				clientY: box.y + box.height / 2
			})
		);
		flushSync();
	}

	async down(id: string): Promise<void> {
		const pointerId = this.#nextPointer++;
		this.#pointers.set(id, pointerId);
		this.#pointer('pointerdown', this.#element(id), pointerId);
	}

	async up(id: string): Promise<void> {
		const pointerId = this.#pointers.get(id);
		if (pointerId === undefined) throw new Error(`"${id}" is not held`);
		this.#pointers.delete(id);
		this.#pointer('pointerup', this.#element(id), pointerId);
	}

	protected async shiftKey(down: boolean): Promise<void> {
		window.dispatchEvent(
			new KeyboardEvent(down ? 'keydown' : 'keyup', {
				key: 'Shift',
				code: 'ShiftLeft',
				shiftKey: down,
				bubbles: true
			})
		);
		flushSync();
	}

	async turn(encoder: number, detents: number, { fine = false } = {}): Promise<void> {
		const element = this.#element(`encoder.${encoder}`);
		if (!fine) {
			element.dispatchEvent(
				new WheelEvent('wheel', {
					bubbles: true,
					cancelable: true,
					deltaMode: 0,
					deltaY: -WHEEL_PX * detents
				})
			);
			flushSync();
			return;
		}
		// push-turn: an alt-drag, a detent per DRAG_PX of travel (up = clockwise)
		const box = element.getBoundingClientRect();
		const x = box.x + box.width / 2;
		let y = box.y + box.height / 2;
		const pointerId = this.#nextPointer++;
		const event = (type: string) =>
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				pointerId,
				isPrimary: true,
				button: 0,
				buttons: type === 'pointerup' ? 0 : 1,
				altKey: true,
				clientX: x,
				clientY: y
			});
		element.dispatchEvent(event('pointerdown'));
		for (let i = 0; i < Math.abs(detents); i++) {
			y -= Math.sign(detents) * DRAG_PX;
			element.dispatchEvent(event('pointermove'));
		}
		element.dispatchEvent(event('pointerup'));
		flushSync();
	}

	async push(encoder: number): Promise<void> {
		const element = this.#element(`encoder.${encoder}`);
		const pointerId = this.#nextPointer++;
		this.#pointer('pointerdown', element, pointerId);
		this.#pointer('pointerup', element, pointerId);
	}

	async wait(ms: number): Promise<void> {
		await this.time.advance(ms);
		flushSync();
	}

	led(id: string): KeyLedState {
		return (this.#element(id).getAttribute('data-led') ?? 'off') as KeyLedState;
	}

	screen(): string {
		return describeFrame(this.simulator.frame);
	}
}
