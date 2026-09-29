/**
 * The agent's tools. Nothing dangerous exists as a tool: no firmware, no project load (CC86), no
 * remote keys, no file writes, no raw MIDI.
 */
import { DEVICE_TOOLS } from './device';
import { DEVICE_MAP_TOOLS } from './device-map';
import { KNOWLEDGE_TOOLS } from './knowledge';
import { LISTEN_TOOLS } from './listen';
import { NAVIGATE_TOOLS } from './navigate';
import { PRESET_TOOLS } from './presets';
import { PROJECT_TOOLS } from './project';
import { VIRTUAL_TOOLS } from './virtual';
import { ToolRegistry, type AnyTool } from './define';

export * from './define';
export * from './device';
export * from './device-map';
export * from './knowledge';
export * from './listen';
export * from './navigate';
export * from './presets';
export * from './project';
export * from './virtual';

/** Every tool the conductor may use. */
export const CONDUCTOR_TOOLS: readonly AnyTool[] = [
	...DEVICE_TOOLS,
	...DEVICE_MAP_TOOLS,
	...KNOWLEDGE_TOOLS,
	...LISTEN_TOOLS,
	...NAVIGATE_TOOLS,
	...PRESET_TOOLS,
	...PROJECT_TOOLS,
	...VIRTUAL_TOOLS
];

/** The manual expert's tools: read-only manual access. */
export const MANUAL_EXPERT_TOOL_NAMES = ['read_manual_unit', 'search_manual'] as const;

/** The conductor's registry (name-sorted, strict schemas). */
export function createConductorRegistry(): ToolRegistry {
	return new ToolRegistry(CONDUCTOR_TOOLS);
}
