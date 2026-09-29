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

	test('draws keys as the device prints them, and rings the one pointed at on the replica', async ({
		page
	}) => {
		await page.goto('/manual/players.overview');
		// `shift + player`: the shift key and the player key's arpeggio picture, not their names
		const combo = page.getByRole('img', { name: 'shift + player' }).first();
		await expect(combo).toBeVisible();
		await expect(combo.locator('svg.glyph')).toHaveCount(2);
		await combo.locator('.combo__key').nth(1).hover();
		await expect(page.locator('[data-id="key.player"]')).toHaveAttribute('data-hl', 'press');
		await page.mouse.move(0, 0);
		await expect(page.locator('[data-id="key.player"]')).not.toHaveAttribute('data-hl', /.+/);
	});

	test('shows which key is which, each ringed on the replica when pointed at', async ({ page }) => {
		await page.goto('/manual/keys');
		await expect(page.getByRole('heading', { name: 'Which key is which', level: 1 })).toBeVisible();
		const m3 = page.getByRole('button', { name: /^M3 · page 3 · filter/ });
		await expect(m3.locator('svg.glyph')).toHaveCount(1);
		await m3.hover();
		await expect(page.locator('[data-id="key.m3"]')).toHaveAttribute('data-hl', 'press');
		// the keyboard as the panel lays it out: 14 naturals, 10 accidentals
		await expect(page.locator('.board .key')).toHaveCount(24);
		const nav = page.getByRole('complementary', { name: 'manual contents' });
		await expect(nav.getByRole('link', { name: 'which key is which' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	test('opens an area in the sidebar and marks the unit being read', async ({ page }) => {
		await page.goto('/manual');
		const nav = page.getByRole('complementary', { name: 'manual contents' });
		// every unit is linked from the sidebar, closed areas included
		expect(await nav.locator('.unit').count()).toBeGreaterThan(150);
		await nav.getByRole('button', { name: 'sequencer' }).click();
		await nav.getByRole('link', { name: 'Parameter locks', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
		await expect(nav.locator('[aria-current="page"]')).toContainText('Parameter locks');
	});

	test('folds the sidebar to icons, shows an area beside it, and remembers the fold', async ({
		page
	}) => {
		await page.goto('/manual/arrange.song-mode');
		const nav = page.getByRole('complementary', { name: 'manual contents' });
		await nav.getByRole('button', { name: 'collapse contents' }).click();
		await expect(nav.getByRole('button', { name: 'expand contents' })).toBeVisible();
		await nav.getByRole('button', { name: 'sequencer' }).hover();
		const flyout = page.getByRole('navigation', { name: 'sequencer units' });
		await expect(flyout.getByRole('link', { name: 'Parameter locks', exact: true })).toBeVisible();
		await page.reload();
		await expect(nav.getByRole('button', { name: 'expand contents' })).toBeVisible();
	});
});
