/**
 * Agent names, dependency-free so UI code can use them without pulling in prompts or tools.
 * Subagent runs are named after the `task` call they run under: `manual-expert:toolu_…`.
 */

/** The name of one subagent run. */
export function subagentName(type: string, toolCallId: string): string {
	return `${type}:${toolCallId}`;
}

/** The task call a subagent run belongs to, or null for the conductor. */
export function parentOf(agent: string): string | null {
	const index = agent.indexOf(':');
	return index < 0 ? null : agent.slice(index + 1);
}

/** The display name of an agent (`manual-expert`). */
export function agentLabel(agent: string): string {
	const index = agent.indexOf(':');
	return index < 0 ? agent : agent.slice(0, index);
}
