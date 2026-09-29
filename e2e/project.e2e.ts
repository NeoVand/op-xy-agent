import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { withSamples } from '../test/fakes/xy-samples';

const blank = new Uint8Array(
	readFileSync(new URL('../src/lib/core/xy/fixtures/blank-1.1.4.xy', import.meta.url))
);

test.describe('the project card', () => {
	test('opens a .xy from disk and says which of its samples are on the op-xy', async ({ page }) => {
		// T1's kit names a preset's kick and one of the owner's recordings (made-up paths)
		const beat = withSamples(blank, [
			{
				t: 0,
				preset: 'drum/test',
				clear: true,
				regions: {
					0: { path: '/fat32/presets/drum/test.preset/kick.wav', key: 53 },
					1: { path: '/fat32/samples/user/take 1.wav', key: 54 }
				}
			}
		]);
		await page.goto('/');
		await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
		await page.getByRole('button', { name: 'project file' }).click();
		const chooser = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: 'open .xy…' }).click();
		await (
			await chooser
		).setFiles({
			name: 'beat.xy',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from(beat)
		});
		await expect(
			page.getByText(
				'loaded beat · 2 samples on your op-xy: load the project from it over usb to hear them'
			)
		).toBeVisible();
	});
});
