import { expect, test } from '@playwright/test';

test.describe('the manual', () => {
	test('shows the areas and finds a unit by search', async ({ page }) => {
		await page.goto('/manual');
		await expect(page.getByRole('heading', { name: 'The OP-XY manual', level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: /^sequencer/ }).first()).toBeVisible();
		await page.getByPlaceholder(/search the manual/i).fill('song mode');
		const hit = page.locator('.hit', { hasText: 'Song mode' }).first();
		await expect(hit).toBeVisible();
		await hit.click();
		await expect(page).toHaveURL(/\/manual\/arrange\.song-mode/);
		await expect(page.getByRole('heading', { name: 'Song mode', level: 1 })).toBeVisible();
	});

	test('shows a unit’s steps as keys that play on the replica beside them', async ({ page }) => {
		await page.goto('/manual/arrange.song-mode');
		await expect(page.getByRole('heading', { name: 'How to' })).toBeVisible();
		await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
		await page.getByRole('button', { name: 'show shift + arrange on the replica' }).first().click();
		// the replica presses shift, then arrange
		await expect(page.locator('[data-id="key.shift"][data-pressed]')).toHaveCount(1, {
			timeout: 3000
		});
	});

	test('opens an area in the sidebar and marks the unit being read', async ({ page }) => {
		await page.goto('/manual');
		const nav = page.getByRole('complementary', { name: 'manual contents' });
		// every unit is linked from the sidebar, closed areas included
		expect(await nav.locator('.unit').count()).toBeGreaterThan(150);
		await nav.getByRole('button', { name: 'sequencer' }).click();
		await nav.getByRole('link', { name: 'Parameter locks', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
		await expect(nav.locator('[aria-current="page"]')).toHaveText('Parameter locks');
	});
});
