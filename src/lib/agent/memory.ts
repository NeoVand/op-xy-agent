/**
 * The agent's memory across conversations (docs/AGENT-V2.md): small text files under `/memories`,
 * read and written through the API's memory tool (`tools/memory.ts`). What the user is like (their
 * level, gear, taste, how they like to learn) and lessons from being corrected. It stays in this
 * browser (IndexedDB), is never sent anywhere but to the model as part of a conversation, and never
 * holds secrets: the prompt says so, and a filter refuses anything that looks like a key.
 */

/** A file in memory. */
export interface MemoryFile {
	readonly path: string;
	readonly text: string;
	readonly updatedAt: number;
}

/** Where the files live. */
export interface MemoryStore {
	/** Every file, by path order. */
	list(): Promise<readonly MemoryFile[]>;
	read(path: string): Promise<MemoryFile | null>;
	write(path: string, text: string): Promise<void>;
	remove(path: string): Promise<void>;
}

/** Why a memory operation cannot run: a message the model reads. */
export class MemoryError extends Error {
	override name = 'MemoryError';
}

export const MEMORY_ROOT = '/memories';

/** Limits that keep memory small enough to read in a glance and to send with a conversation. */
export const MEMORY_LIMITS = { fileChars: 12_000, totalChars: 60_000, files: 60 } as const;

/** The file the agent keeps about the user, added to a conversation's first message. */
export const PROFILE_PATH = `${MEMORY_ROOT}/user.md`;

/**
 * A path the memory accepts: under /memories, no `..`, no empty parts, normalised
 * (`/memories/./a//b.md` → `/memories/a/b.md`). Throws MemoryError otherwise.
 */
export function memoryPath(path: string): string {
	const trimmed = path.trim().replace(/\/+$/, '');
	if (!trimmed.startsWith(MEMORY_ROOT)) {
		throw new MemoryError(`The path ${path} is not under ${MEMORY_ROOT}.`);
	}
	const parts = trimmed.split('/').filter((p) => p !== '' && p !== '.');
	if (parts.includes('..')) throw new MemoryError(`The path ${path} may not contain "..".`);
	if (parts.some((p) => !/^[\w .@+-]+$/.test(p))) {
		throw new MemoryError(`The path ${path} has characters a memory file name cannot use.`);
	}
	return `/${parts.join('/')}`;
}

/** Text that looks like a secret (API keys, tokens), which memory refuses to keep. */
const SECRET =
	/\b(sk-(ant|proj)?-?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{10,})\b/;

/** Throws when `text` may not be stored. */
export function checkMemoryText(text: string): void {
	if (SECRET.test(text)) {
		throw new MemoryError('That looks like a key or a token; memory never keeps secrets.');
	}
	if (text.length > MEMORY_LIMITS.fileChars) {
		throw new MemoryError(
			`A memory file holds at most ${MEMORY_LIMITS.fileChars} characters; keep notes short.`
		);
	}
}

/** Memory in a map (tests, evals, and a browser without IndexedDB). */
export function createMemoryStore(
	seed: readonly { path: string; text: string }[] = [],
	now: () => number = () => Date.now()
): MemoryStore {
	const files = new Map<string, MemoryFile>();
	for (const f of seed) {
		const path = memoryPath(f.path);
		files.set(path, { path, text: f.text, updatedAt: now() });
	}
	return {
		async list() {
			return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
		},
		async read(path) {
			return files.get(path) ?? null;
		},
		async write(path, text) {
			files.set(path, { path, text, updatedAt: now() });
		},
		async remove(path) {
			files.delete(path);
		}
	};
}

const DB_NAME = 'opxy-agent-memory';
const STORE = 'files';

/** Memory in IndexedDB; falls back to a map when IndexedDB is unavailable (private windows). */
export function createIdbMemoryStore(): MemoryStore {
	const fallback = createMemoryStore();
	type Db = import('idb').IDBPDatabase;
	let db: Promise<Db | null> | null = null;
	const open = (): Promise<Db | null> => {
		db ??= (async () => {
			if (typeof indexedDB === 'undefined') return null;
			try {
				const { openDB } = await import('idb');
				return await openDB(DB_NAME, 1, {
					upgrade(database) {
						if (!database.objectStoreNames.contains(STORE)) {
							database.createObjectStore(STORE, { keyPath: 'path' });
						}
					}
				});
			} catch {
				return null;
			}
		})();
		return db;
	};
	return {
		async list() {
			const database = await open();
			if (!database) return fallback.list();
			const all = (await database.getAll(STORE)) as MemoryFile[];
			return all.sort((a, b) => a.path.localeCompare(b.path));
		},
		async read(path) {
			const database = await open();
			if (!database) return fallback.read(path);
			return ((await database.get(STORE, path)) as MemoryFile | undefined) ?? null;
		},
		async write(path, text) {
			const database = await open();
			if (!database) return fallback.write(path, text);
			await database.put(STORE, { path, text, updatedAt: Date.now() });
		},
		async remove(path) {
			const database = await open();
			if (!database) return fallback.remove(path);
			await database.delete(STORE, path);
		}
	};
}

/**
 * What memory holds for a conversation's first message: the profile in full and the other files
 * by name, or null when memory is empty.
 */
export async function memoryBriefing(store: MemoryStore): Promise<string | null> {
	const files = await store.list();
	if (files.length === 0) return null;
	const profile = files.find((f) => f.path === PROFILE_PATH);
	const others = files.filter((f) => f.path !== PROFILE_PATH);
	const parts = [
		profile ? `${PROFILE_PATH}:\n${profile.text.trim()}` : `${PROFILE_PATH}: (none yet)`,
		...(others.length
			? [`Other files (view one when it matters): ${others.map((f) => f.path).join(', ')}`]
			: [])
	];
	return `<memory>\nWhat you remember from earlier conversations:\n${parts.join('\n\n')}\n</memory>`;
}
