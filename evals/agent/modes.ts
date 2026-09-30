/**
 * How the evals run the agent, from the environment, so one suite can compare two setups (A/B):
 * EVAL_MANUAL_MODE=map sends the manual's map with per-message retrieval instead of the whole bundle
 * (docs/AGENT-V2.md), EVAL_ROUTE_SKILLS=0 turns off adding skills with a message.
 */
export const EVAL_MANUAL_MODE: 'full' | 'map' =
	process.env.EVAL_MANUAL_MODE === 'map' ? 'map' : 'full';
export const EVAL_ROUTE_SKILLS = process.env.EVAL_ROUTE_SKILLS !== '0';

/** The conductor options these set. */
export const evalAgentModes = () =>
	({ manualMode: EVAL_MANUAL_MODE, routeSkills: EVAL_ROUTE_SKILLS }) as const;
