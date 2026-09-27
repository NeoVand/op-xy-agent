/**
 * The arrange and mix conformance cases (`arrange-mix.cases.ts`) on the bare simulator, in Node. The
 * same cases run on the app in a browser: `src/lib/app/arrange-mix-conformance.svelte.spec.ts`.
 */
import { SimDriver } from '../testing/driver';
import { arrangeMixConformance } from './arrange-mix.cases';

arrangeMixConformance(async () => new SimDriver());
