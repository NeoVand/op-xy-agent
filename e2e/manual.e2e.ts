import { expect, test } from '@playwright/test';

test.describe('the manual', () => {
	test('lists the areas and finds a unit by search', async ({ page }) => {
		await page.goto('/manual');
		await expect(page.getByRole('heading', { name: 'manual', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'sequencer' })).toBeVisible();
		await page.getByPlaceholder(/search/).fill('song mode');
		const hit = page.locator('.hit', { hasText: 'Song mode' }).first();
		await expect(hit).toBeVisible();
		await hit.click();
		await expect(page).toHaveURL(/\/manual\/arrange\.song-mode/);
		await expect(page.getByRole('heading', { name: 'Song mode', level: 1 })).toBeVisible();
	});

	test('shows a unit’s steps as keys that play on the replica beside them', async ({ page }) => {
		await page.goto('/manual/arrange.song-mode');
		await expect(page.getByRole('heading', { name: 'how to' })).toBeVisible();
		await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
		await page.getByRole('button', { name: 'show shift + arrange on the replica' }).first().click();
		// the replica presses shift, then arrange
		await expect(page.locator('[data-id="key.shift"][data-pressed]')).toHaveCount(1, {
			timeout: 3000
		});
	});

	test('links every unit from the index', async ({ page }) => {
		await page.goto('/manual');
		const units = page.locator('.unit');
		expect(await units.count()).toBeGreaterThan(150);
		await units.filter({ hasText: 'Parameter locks' }).first().click();
		await expect(page.getByRole('heading', { name: 'facts' })).toBeVisible();
	});
});
