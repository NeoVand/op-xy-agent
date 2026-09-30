import { expect, test } from '@playwright/test';

// The command palette in the built site: ⌘K (ctrl K) over the home page, what is typed in it
// never played on the replica, a manual page found from the prerendered index and opened in a
// new tab, and a tempo set from what is typed.
test.describe('the command palette', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
	});

	test('finds a manual page and opens it in a new tab', async ({ page, context }) => {
		await page.keyboard.press('ControlOrMeta+k');
		const palette = page.getByRole('dialog', { name: 'commands' });
		const field = palette.getByRole('combobox');
		await expect(field).toBeFocused();
		await field.fill('parameter locks');
		// typing in the palette plays nothing on the replica
		await expect(page.locator('[data-pressed]')).toHaveCount(0);
		await expect(palette.getByRole('option', { name: /^Parameter locks/ })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		const [tab] = await Promise.all([context.waitForEvent('page'), field.press('Enter')]);
		await tab.waitForLoadState();
		expect(new URL(tab.url()).pathname).toMatch(/\/manual\/sequencer\.parameter-locks$/);
		await expect(palette).toBeHidden();
	});

	test('sets the tempo from what is typed, and closes on escape', async ({ page }) => {
		const tempo = page.getByRole('group', { name: 'now playing' }).locator('.now__value').first();
		await expect(tempo).toHaveText('120');
		await page.getByRole('button', { name: 'commands' }).click();
		const palette = page.getByRole('dialog', { name: 'commands' });
		await palette.getByRole('combobox').fill('tempo 128');
		await palette.getByRole('combobox').press('Enter');
		await expect(tempo).toHaveText('128');
		await page.keyboard.press('ControlOrMeta+k');
		await expect(palette).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(palette).toBeHidden();
	});
});
