/**
 * The OP-XY as validated, typed data: controls inventory and panel geometry, tracks and engines,
 * the CC map with its lane model and risk classes, CC106/107 remote keys, the key-combo grammar,
 * and firmware-aware feature flags. Pure TypeScript over `knowledge/` JSON; nothing here touches
 * MIDI, the DOM or the network.
 */
export * from './ids';
export * from './errors';
export { CONFIDENCE_LEVELS, ConfidenceSchema, type Confidence } from './common.schema';
export {
	AUX_ROLES,
	CONTROL_GROUPS,
	CONTROL_INPUTS,
	CONTROL_KINDS,
	LED_STATES,
	type AuxRole,
	type Control,
	type ControlGeometry,
	type ControlGroup,
	type ControlInput,
	type ControlKind,
	type ControlLed,
	type ControlMidi,
	type ControlShape,
	type ControlsFile,
	type LedState
} from './controls.schema';
export { SIDE_EFFECTS, type SideEffect } from './ccMap.schema';
export { REMOTE_KEY_RISKS, type RemoteKeyGroup, type RemoteKeyRisk } from './remoteKeys.schema';
export type { ChangelogItem } from './changelog.schema';
export { KNOWLEDGE_FILES } from './data';
export { NEW_PROJECT_FILE, newProjectFile } from './newProject';
export type { NewProjectFile, NewProjectTrack } from './newProject.schema';
export * from './controls';
export * from './tracks';
export * from './ccmap';
export * from './remoteKeys';
export * from './keys';
export * from './firmware';
