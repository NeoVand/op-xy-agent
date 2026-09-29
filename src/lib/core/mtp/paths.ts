/**
 * Many paths on one storage, each folder listed once. Listing a folder costs a GetObjectInfo per
 * entry, and a project's samples share folders (a kit's 24 files sit in one preset folder, next to
 * the other presets of its category), so resolving each path from the top on its own would list
 * `presets/` and its category folder dozens of times. Reads only: it lists, nothing else.
 */
import { ROOT } from './codes';
import { sameName, type MtpEntry, type MtpSession } from './session';

/** Resolves `/`-separated paths on one storage, keeping every folder listing it made. */
export class MtpPaths {
	readonly #session: Pick<MtpSession, 'list'>;
	readonly #storage: number;
	readonly #folders = new Map<number, Promise<MtpEntry[]>>();

	constructor(session: Pick<MtpSession, 'list'>, storageId: number) {
		this.#session = session;
		this.#storage = storageId;
	}

	/** The entry at `path` (names compared without case, as on FAT32), or null. */
	async resolve(path: string): Promise<MtpEntry | null> {
		let found: MtpEntry | null = null;
		for (const part of path.split('/').filter(Boolean)) {
			if (found && !found.folder) return null;
			const children = await this.#list(found ? found.handle : ROOT);
			found = children.find((c) => sameName(c.name, part)) ?? null;
			if (!found) return null;
		}
		return found;
	}

	/** How many folders have been listed. */
	get listed(): number {
		return this.#folders.size;
	}

	#list(parent: number): Promise<MtpEntry[]> {
		let listing = this.#folders.get(parent);
		if (!listing) {
			listing = this.#session.list(this.#storage, parent);
			this.#folders.set(parent, listing);
		}
		return listing;
	}
}
