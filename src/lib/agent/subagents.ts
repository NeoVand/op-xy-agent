/**
 * Subagents: `task`-style workers with their own prompt, tools, model and a fresh transcript. They
 * never see or touch the conductor's transcript, which keeps the conductor's cache intact, and they
 * return one compact report (docs/research/70-agent-harness.md §4).
 */
import { DEFAULT_SUBAGENT_MODEL } from './models';
import type { Effort } from './loop';
import { MANUAL_EXPERT_ROLE } from './prompts';
import { MANUAL_EXPERT_TOOL_NAMES } from './tools';

/** How a subagent runs. */
export interface SubagentSpec {
	readonly name: string;
	readonly role: string;
	readonly tools: readonly string[];
	readonly model: string;
	readonly effort: Effort;
	readonly maxTokens: number;
	readonly maxIterations: number;
}

/** The manual expert: Sonnet 5 at low effort, read-only manual tools, cited answers. */
export const MANUAL_EXPERT: SubagentSpec = {
	name: 'manual-expert',
	role: MANUAL_EXPERT_ROLE,
	tools: MANUAL_EXPERT_TOOL_NAMES,
	model: DEFAULT_SUBAGENT_MODEL,
	effort: 'low',
	maxTokens: 16_000,
	maxIterations: 8
};

/** Every subagent by name. */
export const SUBAGENTS: Readonly<Record<string, SubagentSpec>> = {
	[MANUAL_EXPERT.name]: MANUAL_EXPERT
};

export { agentLabel, parentOf, subagentName } from './agent-names';
