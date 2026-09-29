import { expect, test } from '@playwright/test';

test.describe('the home page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
	});

	test('opens on track 3, a synth', async ({ page }) => {
		await expect(page.locator('[data-id="track.3"]')).toHaveAttribute('data-led', 'white');
		await expect(page.locator('[data-id="track.1"]')).not.toHaveAttribute('data-led', 'white');
	});

	test('plays the replica from the computer keyboard, chords included', async ({ page }) => {
		const key = (id: string) => page.locator(`[data-id="${id}"]`);
		await page.keyboard.down('b'); // C4
		await page.keyboard.down('m'); // E4
		await page.keyboard.down('2'); // F♯4
		await expect(key('keyboard.c4')).toHaveAttribute('data-pressed', 'true');
		await expect(key('keyboard.e4')).toHaveAttribute('data-pressed', 'true');
		await expect(key('keyboard.fs4')).toHaveAttribute('data-pressed', 'true');
		await page.keyboard.up('b');
		await page.keyboard.up('m');
		await page.keyboard.up('2');
		await expect(page.locator('[data-pressed]')).toHaveCount(0);
		// the keys say which computer key plays them
		await expect(key('keyboard.f3')).toHaveAttribute('aria-keyshortcuts', 'Z');
	});

	test('leaves the keys alone once switched off', async ({ page }) => {
		const keys = page.getByRole('button', { name: 'computer keyboard' });
		await expect(keys).toHaveAttribute('aria-pressed', 'true');
		await keys.click();
		await expect(keys).toHaveAttribute('aria-pressed', 'false');
		await page.locator('body').click({ position: { x: 5, y: 300 } });
		await page.keyboard.down('b');
		await expect(page.locator('[data-id="keyboard.c4"]')).not.toHaveAttribute('data-pressed');
		await page.keyboard.up('b');
		await keys.click();
	});

	test('starts and stops the transport with Space', async ({ page }) => {
		const lit = () =>
			page.locator('[data-id^="step."][data-led="white"], [data-id^="step."][data-led="red"]');
		await page.locator('body').click({ position: { x: 5, y: 300 } });
		await page.keyboard.press('Space');
		// the playhead walks the step keys
		const seen = new Set<string>();
		for (let i = 0; i < 12; i++) {
			for (const id of await lit().evaluateAll((els) =>
				els.map((e) => e.getAttribute('data-id'))
			)) {
				if (id) seen.add(id);
			}
			await page.waitForTimeout(120);
		}
		expect(seen.size).toBeGreaterThan(2);
		await page.keyboard.press('Space');
		const still = await lit().evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
		await page.waitForTimeout(600);
		expect(await lit().evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(
			still
		);
	});

	test('shows the chat composer: a field, attach and send', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'attach files' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'send' })).toBeVisible();
		await expect(page.getByLabel('message to the agent')).toBeVisible();
	});
});
