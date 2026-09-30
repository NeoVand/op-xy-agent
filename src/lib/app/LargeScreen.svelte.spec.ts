// The display, large: its pixels at the display's own proportions in a thin frame, quiet for
// screen readers (the replica's own display speaks), put away by a click on it. Over the device on
// the stage, the room for it opens and closes with it.
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ReplicaState } from '$lib/replica';
import { SCREEN_PART } from '$lib/replica/geometry';
import DeviceStage from '$lib/ui/shell/DeviceStage.svelte';
import LargeScreen from './LargeScreen.svelte';

describe('the large display', () => {
	it('is the pixels at the display’s proportions in a thin frame, and a click puts it away', async () => {
		let closed = 0;
		const screen = await render(LargeScreen, {
			props: { replica: new ReplicaState(), onclose: () => closed++ }
		});
		// laid-out sizes: while it grows it is drawn smaller
		const frame = screen.container.querySelector<HTMLElement>('.large__frame')!;
		const pixels = screen.container.querySelector<HTMLElement>('.large__pixels')!;
		// 13rem tall in all unless the page says otherwise, the frame a few pixels round the pixels
		expect(frame.offsetHeight).toBe(208);
		expect(frame.offsetWidth - pixels.offsetWidth).toBeLessThanOrEqual(8);
		const { w, h } = SCREEN_PART.active;
		expect(pixels.offsetWidth / pixels.offsetHeight).toBeCloseTo(w / h, 2);
		// the replica's display reads what it shows; this copy stays quiet
		expect(screen.container.querySelector('[aria-live]')).toBeNull();
		await screen.getByRole('button', { name: 'put the large display away' }).click();
		expect(closed).toBe(1);
	});

	it('opens over the device on the stage, and goes', async () => {
		const above = createRawSnippet(() => ({ render: () => '<p>the display, large</p>' }));
		const stage = await render(DeviceStage, { props: { above } });
		const shown = stage.getByText('the display, large');
		await expect.element(shown).toBeVisible();
		// before the device, in the stage's flow
		const device = stage.container.querySelector('.stage__device')!;
		const room = stage.container.querySelector('.stage__above')!;
		expect(room.compareDocumentPosition(device) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		await stage.rerender({ above: undefined });
		await expect.element(shown).not.toBeInTheDocument();
	});
});
