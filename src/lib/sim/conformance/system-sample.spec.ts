/**
 * The project, COM, preset and sample conformance cases (`system-sample.cases.ts`) on the bare
 * simulator, in Node. The same cases run on the app in a browser:
 * `src/lib/app/system-sample-conformance.svelte.spec.ts`.
 */
import { SimDriver } from '../testing/driver';
import { systemSampleConformance } from './system-sample.cases';

systemSampleConformance(async () => new SimDriver());
