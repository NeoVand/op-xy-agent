/**
 * The sequencer conformance cases (`sequencer.cases.ts`) on the bare simulator, in Node. The same
 * cases run on the app in a browser: `src/lib/app/sequencer-conformance.svelte.spec.ts`.
 */
import { SimDriver } from '../testing/driver';
import { sequencerConformance } from './sequencer.cases';

sequencerConformance(async () => new SimDriver());
