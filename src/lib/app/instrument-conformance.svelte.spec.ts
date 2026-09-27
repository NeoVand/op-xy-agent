/**
 * The basics and instrument conformance cases (`$lib/sim/conformance/instrument.cases.ts`) on the
 * app itself: the rendered replica clicked with pointer events, Shift held on the keyboard, the
 * LEDs read from the page. The same cases run on the bare simulator in Node
 * (`$lib/sim/conformance`).
 */
import { afterEach } from 'vitest';
import { instrumentConformance } from '$lib/sim/conformance/instrument.cases';
import { AppDriver } from './testing/app-driver';

let open: AppDriver[] = [];

afterEach(() => {
	for (const driver of open) driver.dispose();
	open = [];
});

instrumentConformance(async () => {
	const driver = await AppDriver.start();
	open.push(driver);
	return driver;
});
