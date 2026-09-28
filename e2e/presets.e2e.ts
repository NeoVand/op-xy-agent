import { expect, test } from '@playwright/test';

test('the preset maker opens and leads back to the app', async ({ page }) => {
	await page.goto('/presets');
	await expect(page.getByRole('heading', { name: 'preset maker', level: 1 })).toBeVisible();
	await page.getByRole('link', { name: 'back to the app' }).click();
	await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
});
