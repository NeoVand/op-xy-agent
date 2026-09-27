/**
 * The OP-XY UI simulator (decision D10): {@link OpxySim} turns replica input into screen frames and
 * LED states; `screen/` draws the frames the way TE's guide art shows them.
 */
export { OpxySim, type OpxySimOptions, type SimInput } from './opxy-sim.svelte';
export { buildFrame, buildLeds, lfoSpeed, AUX_NAMES } from './frames';
export * from './params';
export * from './screen';
