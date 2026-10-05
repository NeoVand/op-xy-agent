import { devices, expect, test, type Page } from '@playwright/test';

// A phone gets PhoneNote instead of the app: app.html marks it before the first paint, and the root
// layout renders the note alone (docs/DECISIONS.md D13).
const { viewport, screen, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7'];

const note = (page: Page) => page.getByRole('heading', { name: 'made for a desktop browser' });

test.describe('on a phone', () => {
	test.use({ viewport, screen, deviceScaleFactor, isMobile, hasTouch, userAgent });

	test('shows the recording and the note, and none of the app', async ({ page }) => {
		await page.goto('/');
		await expect(note(page)).toBeVisible();
		await expect(page.locator('video')).toHaveJSProperty('paused', false);
		await expect(page.getByRole('button', { name: /(share|copy) the link/ })).toBeVisible();
		await expect(page.getByRole('group', { name: 'OP-XY replica' })).toHaveCount(0);
		await expect(page.getByRole('navigation', { name: 'primary' })).toHaveCount(0);
		const [scrollWidth, clientWidth] = await page.evaluate(() => [
			document.documentElement.scrollWidth,
			document.documentElement.clientWidth
		]);
		expect(scrollWidth).toBe(clientWidth);
	});

	test('shows it from the first paint, before the app’s code runs', async ({ page }) => {
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('/manual');
		await expect(note(page)).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'primary' })).toBeHidden();
	});

	test('keeps the recording still while motion is reduced', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		const video = page.locator('video');
		await expect(video).toHaveJSProperty('controls', true);
		await expect(video).toHaveJSProperty('paused', true);
	});
});

test('a computer gets the app, and never fetches the phone’s preview', async ({ page }) => {
	const fetched: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('/preview/')) fetched.push(request.url());
	});
	await page.goto('/');
	await expect(page.getByRole('group', { name: 'OP-XY replica' })).toBeVisible();
	await expect(note(page)).toHaveCount(0);
	expect(fetched).toEqual([]);
});
