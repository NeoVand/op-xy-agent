/**
 * What was dropped on the preset maker, folders included: a drum folder dropped whole gives every
 * file inside it (at any depth, hidden files and macOS's `__MACOSX` left out), each with its path
 * in the folder, sorted by path so a kit's files arrive in their own order.
 */

/** A dropped file and where it sat in the dropped folder (`kit/kick.wav`), or its name. */
export interface DroppedFile {
	readonly file: File;
	readonly path: string;
}

const hidden = (name: string) => name.startsWith('.') || name === '__MACOSX';

function fileOf(entry: FileSystemFileEntry): Promise<File | null> {
	return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
}

/** Every entry of a folder: `readEntries` hands them over a batch at a time. */
async function entriesOf(folder: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
	const reader = folder.createReader();
	const out: FileSystemEntry[] = [];
	for (;;) {
		const batch = await new Promise<FileSystemEntry[]>((resolve) =>
			reader.readEntries(resolve, () => resolve([]))
		);
		if (batch.length === 0) return out;
		out.push(...batch);
	}
}

async function walk(entry: FileSystemEntry, into: DroppedFile[], depth = 0): Promise<void> {
	if (hidden(entry.name) || depth > 6) return;
	if (entry.isFile) {
		const file = await fileOf(entry as FileSystemFileEntry);
		if (file) into.push({ file, path: entry.fullPath.replace(/^\//, '') });
		return;
	}
	if (entry.isDirectory) {
		for (const child of await entriesOf(entry as FileSystemDirectoryEntry)) {
			await walk(child, into, depth + 1);
		}
	}
}

/**
 * The files of a drop, folders opened. Call it in the drop handler itself: the browser only hands
 * out the drop's entries during the event (the reading after that may take its time).
 */
export async function droppedEntries(data: DataTransfer): Promise<DroppedFile[]> {
	const entries = Array.from(data.items ?? [])
		.filter((item) => item.kind === 'file')
		.map((item) => item.webkitGetAsEntry?.() ?? null);
	if (!entries.some((e) => e?.isDirectory)) {
		return Array.from(data.files).map((file) => ({ file, path: file.name }));
	}
	const out: DroppedFile[] = [];
	for (const entry of entries) if (entry) await walk(entry, out);
	return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

/** The files of a drop, folders opened (see {@link droppedEntries}). */
export async function droppedFiles(data: DataTransfer): Promise<File[]> {
	return (await droppedEntries(data)).map((d) => d.file);
}
