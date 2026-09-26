import { describe, expect, it } from 'vitest';
import ccMapJson from '$knowledge/midi/cc-map.json';
import remoteKeysJson from '$knowledge/midi/remote-keys.json';
import changelogJson from '$knowledge/firmware/changelog-midi-usb.json';
import controlsJson from '$knowledge/opxy/controls.json';
import sysex from '$knowledge/firmware/te-sysex.json';
import { CcMapFileSchema } from './ccMap.schema';
import { ChangelogFileSchema } from './changelog.schema';
import { formatIssues, parseKnowledge } from './common.schema';
import { ControlsFileSchema } from './controls.schema';
import { ccMapFile, controlsFile, crossCheckKnowledge, remoteKeysFile } from './data';
import { KnowledgeValidationError } from './errors';
import { RemoteKeysFileSchema } from './remoteKeys.schema';

const clone = <T>(value: T): T => structuredClone(value);

/** Enough of controls.json's shape to break it on purpose (the JSON import type is a wide union). */
interface LooseControls {
	controls: {
		id: string;
		aliases: string[];
		source: string[];
		colors: Record<string, string>;
		midi: { remoteKey: number | null } | null;
	}[];
}
const looseControls = () => clone(controlsJson) as unknown as LooseControls;

function issuesOf(schema: typeof ControlsFileSchema, data: unknown): string[] {
	const result = schema.safeParse(data);
	return result.success ? [] : formatIssues(result.error);
}

describe('$knowledge alias', () => {
	it('resolves committed knowledge JSON', () => {
		expect(sysex).toBeTypeOf('object');
	});
});

describe('committed knowledge passes validation', () => {
	it.each([
		['controls.json', ControlsFileSchema, controlsJson],
		['cc-map.json', CcMapFileSchema, ccMapJson],
		['remote-keys.json', RemoteKeysFileSchema, remoteKeysJson],
		['changelog-midi-usb.json', ChangelogFileSchema, changelogJson]
	] as const)('%s', (_name, schema, json) => {
		const result = schema.safeParse(json);
		expect(result.success ? [] : formatIssues(result.error)).toEqual([]);
	});

	it('cross-file facts agree', () => {
		expect(crossCheckKnowledge(controlsFile, ccMapFile, remoteKeysFile)).toEqual([]);
	});

	it('controls.json and cc-map.json list the same controller-mode emits', () => {
		const emits = new Map<string, string>();
		for (const control of controlsFile.controls) {
			for (const emit of control.midi?.controllerMode ?? []) {
				emits.set(`${emit.message} ${emit.number}`, `${control.id} ${emit.input}`);
			}
		}
		let checked = 0;
		for (const entry of ccMapFile.controllerModeOut.map) {
			entry.numbers.forEach((number, i) => {
				const owner = emits.get(`${entry.type} ${number}`);
				expect(owner, `${entry.control} → ${entry.type} ${number}`).toBeDefined();
				const remoteKey = entry.remoteKeyIndex?.[i];
				if (remoteKey !== undefined) {
					const control = controlsFile.controls.find((c) => owner?.startsWith(`${c.id} `));
					expect(control?.midi?.remoteKey, entry.control).toBe(remoteKey);
				}
				checked++;
			});
		}
		expect(checked).toBe(emits.size);
	});
});

describe('validation catches broken data', () => {
	it('rejects unknown and duplicate control ids', () => {
		const bad = looseControls();
		bad.controls[0].id = 'key.nope';
		expect(issuesOf(ControlsFileSchema, bad).join('\n')).toMatch(/controls\.0\.id/);

		const dup = looseControls();
		dup.controls[1].id = dup.controls[0].id;
		expect(issuesOf(ControlsFileSchema, dup).join('\n')).toMatch(/duplicate id/);
	});

	it('rejects a missing control', () => {
		const bad = looseControls();
		bad.controls = bad.controls.filter((c) => c.id !== 'key.shift');
		expect(issuesOf(ControlsFileSchema, bad).join('\n')).toMatch(/missing key\.shift/);
	});

	it('rejects dangling source keys and colour tokens', () => {
		const bad = looseControls();
		bad.controls[0].source = ['NOPE'];
		bad.controls[0].colors = { tile: 'no-such-token' };
		const text = issuesOf(ControlsFileSchema, bad).join('\n');
		expect(text).toMatch(/unknown source key "NOPE"/);
		expect(text).toMatch(/unknown colour token "no-such-token"/);
	});

	it('rejects ambiguous names', () => {
		const bad = looseControls();
		bad.controls[0].aliases = ['shift'];
		expect(issuesOf(ControlsFileSchema, bad).join('\n')).toMatch(/name "shift" is also used/);
	});

	it('rejects a remote key claimed twice', () => {
		const bad = looseControls();
		const [a, b] = bad.controls.filter((c) => c.midi?.remoteKey != null);
		if (!a.midi || !b.midi) throw new Error('fixture');
		b.midi.remoteKey = a.midi.remoteKey;
		expect(issuesOf(ControlsFileSchema, bad).join('\n')).toMatch(/remote key \d+ also on/);
	});

	it('rejects a malformed CC map', () => {
		const bad = clone(ccMapJson);
		bad.global[0].cc = 128;
		bad.perTrack[0].id = bad.global[1].id;
		const result = CcMapFileSchema.safeParse(bad);
		expect(result.success).toBe(false);
		const text = result.success ? '' : formatIssues(result.error).join('\n');
		expect(text).toMatch(/global\.0\.cc/);
		expect(text).toMatch(/duplicate parameter id/);
	});

	it('rejects gaps in the remote key list and unknown recipe keys', () => {
		const bad = clone(remoteKeysJson);
		bad.keys.splice(3, 1);
		bad.recipes[0].steps[0][1] = 'nope';
		const result = RemoteKeysFileSchema.safeParse(bad);
		const text = result.success ? '' : formatIssues(result.error).join('\n');
		expect(text).toMatch(/without gaps/);
		expect(text).toMatch(/unknown key id "nope"/);
	});

	it('rejects out-of-order changelog items', () => {
		const bad = clone(changelogJson);
		bad.items.reverse();
		expect(ChangelogFileSchema.safeParse(bad).success).toBe(false);
	});

	it('reports cross-file disagreements', () => {
		const controls = clone(controlsFile);
		const shift = controls.controls.find((c) => c.id === 'key.shift');
		if (!shift?.midi) throw new Error('fixture');
		shift.midi.controllerMode[0].number = 99;
		shift.midi.remoteKey = 99;
		const issues = crossCheckKnowledge(controls, ccMapFile, remoteKeysFile);
		expect(issues.join('\n')).toMatch(/remote key 55 \(shift\) has no control/);
		expect(issues.join('\n')).toMatch(/key\.shift claims remote key 99/);

		const drift = clone(controlsFile);
		const m1 = drift.controls.find((c) => c.id === 'key.m1');
		if (!m1?.midi) throw new Error('fixture');
		m1.midi.controllerMode[0].number = 99;
		expect(crossCheckKnowledge(drift, ccMapFile, remoteKeysFile).join('\n')).toMatch(
			/controller-mode cc 11 ≠ key\.m1 \(cc 99\)/
		);

		const rk = clone(remoteKeysFile);
		rk.keys[0].source = ['NOPE'];
		expect(crossCheckKnowledge(controlsFile, ccMapFile, rk).join('\n')).toMatch(
			/unknown source "NOPE"/
		);
	});

	it('parseKnowledge throws a typed error naming the file and every issue', () => {
		const bad = clone(changelogJson);
		bad.items[0].version = 'one';
		let caught: unknown;
		try {
			parseKnowledge(ChangelogFileSchema, bad, 'knowledge/x.json');
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(KnowledgeValidationError);
		const error = caught as KnowledgeValidationError;
		expect(error.name).toBe('KnowledgeValidationError');
		expect(error.file).toBe('knowledge/x.json');
		expect(error.issues[0]).toMatch(/^items\.0\.version: /);
		expect(error.message).toMatch(/knowledge\/x\.json is invalid \(1 issue/);
	});
});
