/**
 * The basics and instrument conformance cases (`instrument.cases.ts`) on the bare simulator, in
 * Node. The same cases run on the app in a browser: `src/lib/app/instrument-conformance.svelte.spec.ts`.
 */
import { SimDriver } from '../testing/driver';
import { instrumentConformance } from './instrument.cases';

instrumentConformance(async () => new SimDriver());
