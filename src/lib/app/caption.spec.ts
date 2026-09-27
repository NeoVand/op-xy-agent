import { describe, expect, it } from 'vitest';
import { FakeTime } from '../../../test/fakes/fake-time';
import { HintCaption } from './caption.svelte';
import { comboHint, notRemoteHint, offlineHint } from './hints';

const m1 = notRemoteHint('key.m1', 'press', null);
const shift = notRemoteHint('key.shift', 'press', null);
const offline = offlineHint('keyboard.c4');

function caption(options: Partial<ConstructorParameters<typeof HintCaption>[0]> = {}) {
	const time = new FakeTime();
	return { time, caption: new HintCaption({ clock: time, timers: time, ...options }) };
}

describe('HintCaption', () => {
	it('shows the newest hint and hides it by itself', async () => {
		const { time, caption: c } = caption({ visibleMs: 5000 });
		expect(c.show(m1)).toBe(true);
		expect(c.current).toBe(m1);
		expect(c.show(shift)).toBe(true);
		expect(c.current).toBe(shift);
		await time.advance(4999);
		expect(c.current).toBe(shift);
		await time.advance(1);
		expect(c.current).toBeNull();
	});

	it('does not repeat the same hint for a while, per kind', async () => {
		const { time, caption: c } = caption({ visibleMs: 1000 });
		c.show(m1);
		await time.advance(1000);
		expect(c.show(m1)).toBe(false);
		expect(c.current).toBeNull();
		await time.advance(9000);
		expect(c.show(m1)).toBe(true);
		c.show(offline);
		await time.advance(20_000);
		expect(c.show(offline)).toBe(false);
		await time.advance(10_000);
		expect(c.show(offline)).toBe(true);
		const combo = comboHint(['key.shift'], 'key.play', { kind: 'start' }, null);
		c.show(combo);
		await time.advance(6000);
		expect(c.show(combo)).toBe(true);
	});

	it('keeps the hint that is up while it keeps being triggered', async () => {
		const { time, caption: c } = caption({ visibleMs: 3000 });
		c.show(m1);
		await time.advance(2500);
		expect(c.show(m1)).toBe(false);
		await time.advance(2500);
		expect(c.current).toBe(m1);
		await time.advance(500);
		expect(c.current).toBeNull();
	});

	it('pauses while held (hover or focus) and resumes afterwards', async () => {
		const { time, caption: c } = caption({ visibleMs: 2000 });
		c.show(shift);
		c.hold(true);
		await time.advance(10_000);
		expect(c.current).toBe(shift);
		c.hold(false);
		await time.advance(1999);
		expect(c.current).toBe(shift);
		await time.advance(1);
		expect(c.current).toBeNull();
		c.hold(false);
		expect(time.pendingTimers).toBe(0);
	});

	it('keeps a dismissed hint quiet for longer', async () => {
		const { time, caption: c } = caption({ dismissedMs: 60_000 });
		c.show(m1);
		c.dismiss();
		expect(c.current).toBeNull();
		c.dismiss();
		await time.advance(30_000);
		expect(c.show(m1)).toBe(false);
		await time.advance(30_000);
		expect(c.show(m1)).toBe(true);
		c.dispose();
		expect(c.current).toBeNull();
		expect(time.pendingTimers).toBe(0);
	});
});
