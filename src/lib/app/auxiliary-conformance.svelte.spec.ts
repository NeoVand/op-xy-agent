/**
 * The auxiliary conformance cases (`$lib/sim/conformance/auxiliary.cases.ts`) on the app itself:
 * the rendered replica clicked with pointer events, Shift held on the keyboard, encoders turned
 * with the wheel, the LEDs read from the page. The same cases run on the bare simulator in Node
 * (`$lib/sim/conformance`).
 */
import { afterEach } from 'vitest';
import { auxiliaryConformance } from '$lib/sim/conformance/auxiliary.cases';
import { AppDriver } from './testing/app-driver';

let open: AppDriver[] = [];

afterEach(() => {
	for (const driver of open) driver.dispose();
	open = [];
});

auxiliaryConformance(async () => {
	const driver = await AppDriver.start();
	open.push(driver);
	return driver;
});
