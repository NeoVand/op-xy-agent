/**
 * The auxiliary conformance cases (`auxiliary.cases.ts`) on the bare simulator, in Node. The same
 * cases run on the app in a browser: `src/lib/app/auxiliary-conformance.svelte.spec.ts`.
 */
import { SimDriver } from '../testing/driver';
import { auxiliaryConformance } from './auxiliary.cases';

auxiliaryConformance(async () => new SimDriver());
