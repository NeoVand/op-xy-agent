/**
 * Puts a preset built by the preset maker (`core/presets`) on the OP-XY over MTP: into
 * `presets/<folder>/<name>.preset/`, creating the folder when needed. It only ever adds: a preset
 * already there is refused, never replaced. The caller must have the owner's approval and call
 * `session.allowWrites()` first.
 */
import { MtpPolicyError } from './policy';
import { sameName, type MtpSession } from './session';

/** A preset folder and its files, as `buildPreset` returns them (`<name>.preset/<file>`). */
export interface PresetFiles {
	readonly folder: string;
	readonly files: readonly { readonly path: string; readonly bytes: Uint8Array }[];
}

/**
 * A user folder under `presets/` that keeps every sample path within what a project holds
 * (note 30 §3.5 and `core/presets` FOLDER_ROOM): up to 7 lowercase letters, digits, spaces,
 * `#`, `(`, `)` or `-`, starting with a letter or digit.
 */
export const PRESET_FOLDER = /^[a-z0-9][a-z0-9 #()-]{0,6}$/;

export interface InstallProgress {
	readonly done: number;
	readonly total: number;
	readonly file: string;
}

/** Installs the preset and returns where it went, e.g. `presets/mine/kit.preset`. */
export async function installPreset(
	session: MtpSession,
	preset: PresetFiles,
	folder: string,
	onProgress?: (progress: InstallProgress) => void
): Promise<string> {
	if (!PRESET_FOLDER.test(folder)) {
		throw new MtpPolicyError(`"${folder}" is not a folder name the preset paths fit under`);
	}
	const [storageId] = await session.storageIds();
	if (storageId === undefined) throw new MtpPolicyError('the device shows no storage');
	const presets = await session.resolve(storageId, 'presets');
	if (!presets?.folder) throw new MtpPolicyError('the device has no presets folder');
	const target = await session.folder(storageId, presets.handle, folder);
	const where = `presets/${folder}/${preset.folder}`;
	const taken = (await session.list(storageId, target)).some((e) =>
		sameName(e.name, preset.folder)
	);
	if (taken) throw new MtpPolicyError(`${where} is already on the device: pick another name`);
	const home = await session.folder(storageId, target, preset.folder);
	const files = preset.files.map((f) => ({
		name: f.path.split('/').pop() as string,
		bytes: f.bytes
	}));
	for (const [i, file] of files.entries()) {
		onProgress?.({ done: i, total: files.length, file: file.name });
		await session.write(storageId, home, file.name, file.bytes);
	}
	onProgress?.({ done: files.length, total: files.length, file: '' });
	return where;
}
