/**
 * Loads and validates the committed OP-XY knowledge at import time. A malformed file throws
 * {@link KnowledgeValidationError} here, so no consumer ever sees unchecked data. Everything is
 * pure parsing of bundled JSON: no I/O, no globals.
 */
import ccMapJson from '$knowledge/midi/cc-map.json';
import remoteKeysJson from '$knowledge/midi/remote-keys.json';
import changelogJson from '$knowledge/firmware/changelog-midi-usb.json';
import controlsJson from '$knowledge/opxy/controls.json';
import { CcMapFileSchema, type CcMapFile } from './ccMap.schema';
import { ChangelogFileSchema, type ChangelogFile } from './changelog.schema';
import { collectSourceLists, parseKnowledge } from './common.schema';
import { ControlsFileSchema, type ControlsFile } from './controls.schema';
import { KnowledgeValidationError } from './errors';
import { RemoteKeysFileSchema, type RemoteKeysFile } from './remoteKeys.schema';

/** Repo-relative paths of the files this module validates. */
export const KNOWLEDGE_FILES = {
	controls: 'knowledge/opxy/controls.json',
	ccMap: 'knowledge/midi/cc-map.json',
	remoteKeys: 'knowledge/midi/remote-keys.json',
	changelog: 'knowledge/firmware/changelog-midi-usb.json'
} as const;

/** `knowledge/opxy/controls.json`, validated. */
export const controlsFile: ControlsFile = parseKnowledge(
	ControlsFileSchema,
	controlsJson,
	KNOWLEDGE_FILES.controls
);

/** `knowledge/midi/cc-map.json`, validated. */
export const ccMapFile: CcMapFile = parseKnowledge(
	CcMapFileSchema,
	ccMapJson,
	KNOWLEDGE_FILES.ccMap
);

/** `knowledge/midi/remote-keys.json`, validated. */
export const remoteKeysFile: RemoteKeysFile = parseKnowledge(
	RemoteKeysFileSchema,
	remoteKeysJson,
	KNOWLEDGE_FILES.remoteKeys
);

/** `knowledge/firmware/changelog-midi-usb.json`, validated. */
export const changelogFile: ChangelogFile = parseKnowledge(
	ChangelogFileSchema,
	changelogJson,
	KNOWLEDGE_FILES.changelog
);

/**
 * Checks the facts that two files state about each other. Exported for tests; runs once at import.
 * @returns one line per inconsistency (empty when all agree)
 */
export function crossCheckKnowledge(
	controls: ControlsFile,
	ccMap: CcMapFile,
	remoteKeys: RemoteKeysFile
): string[] {
	const issues: string[] = [];

	// remote-keys.json cites cc-map.json's sources table.
	const sources = new Set(Object.keys(ccMap.sources));
	for (const { path, keys } of collectSourceLists(remoteKeys)) {
		for (const key of keys) {
			if (!sources.has(key)) issues.push(`remote-keys ${path.join('.')}: unknown source "${key}"`);
		}
	}

	// Every CC106/107 value presses exactly one inventory control, and both files agree on what
	// that control emits in controller mode (the derived "index + 5 / + 27" relation).
	const byRemoteKey = new Map(
		controls.controls
			.filter((c) => c.midi?.remoteKey != null)
			.map((c) => [c.midi?.remoteKey as number, c])
	);
	for (const key of remoteKeys.keys) {
		const control = byRemoteKey.get(key.value);
		if (!control) {
			issues.push(`remote key ${key.value} (${key.id}) has no control in controls.json`);
			continue;
		}
		const input = control.kind === 'encoder' ? 'click' : 'press';
		const emit = control.midi?.controllerMode.find((e) => e.input === input);
		const expected =
			key.ctrlModeCc !== undefined
				? { message: 'cc', number: key.ctrlModeCc }
				: { message: 'note', number: key.ctrlModeNote };
		if (emit?.message !== expected.message || emit.number !== expected.number) {
			issues.push(
				`remote key ${key.value} (${key.id}): controller-mode ${expected.message} ${expected.number} ≠ ${control.id} (${emit?.message} ${emit?.number})`
			);
		}
		byRemoteKey.delete(key.value);
	}
	for (const [value, control] of byRemoteKey) {
		issues.push(`${control.id} claims remote key ${value}, which remote-keys.json does not list`);
	}
	return issues;
}

{
	const issues = crossCheckKnowledge(controlsFile, ccMapFile, remoteKeysFile);
	if (issues.length > 0) {
		throw new KnowledgeValidationError(
			`${KNOWLEDGE_FILES.controls} ↔ ${KNOWLEDGE_FILES.remoteKeys}`,
			issues
		);
	}
}
