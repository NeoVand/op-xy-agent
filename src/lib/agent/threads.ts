/**
 * Conversation threads, persisted in this browser's IndexedDB (via `idb`): the API transcript
 * (append-only, thinking blocks intact), the chat as displayed, the plan, the usage totals and the
 * revision journal. Nothing here ever holds an API key. A memory store stands in for tests and for
 * browsers without IndexedDB (private windows).
 */
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ChatEntry, UsageTotals } from './chat';
import type { Revision, Todo } from './types';

/** One stored thread. */
export interface ThreadRecord {
	readonly id: string;
	title: string;
	readonly createdAt: number;
	updatedAt: number;
	/** Model the conductor used last. */
	model: string;
	/** The API transcript. */
	messages: BetaMessageParam[];
	/** What the chat shows. */
	entries: ChatEntry[];
	todos: Todo[];
	usage: UsageTotals;
	revisions: Revision[];
	/** The last device note added to the transcript (sent again only when it changes). */
	deviceNote: string | null;
}

/** A thread in the list (without its contents). */
export interface ThreadSummary {
	readonly id: string;
	readonly title: string;
	readonly updatedAt: number;
}

/** Where threads live. */
export interface ThreadStore {
	load(id: string): Promise<ThreadRecord | null>;
	save(thread: ThreadRecord): Promise<void>;
	list(): Promise<ThreadSummary[]>;
	remove(id: string): Promise<void>;
}

/** Deep, plain copy (drops Svelte proxies and anything that is not data). */
function plain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** Threads in memory only. */
export function createMemoryThreadStore(): ThreadStore {
	const threads = new Map<string, ThreadRecord>();
	return {
		async load(id) {
			const thread = threads.get(id);
			return thread ? plain(thread) : null;
		},
		async save(thread) {
			threads.set(thread.id, plain(thread));
		},
		async list() {
			return [...threads.values()]
				.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }))
				.sort((a, b) => b.updatedAt - a.updatedAt);
		},
		async remove(id) {
			threads.delete(id);
		}
	};
}

const DB_NAME = 'opxy-agent';
const STORE = 'threads';

/**
 * Threads in IndexedDB. Falls back to memory when IndexedDB is unavailable or fails to open, so
 * the agent still works (without history) in private windows.
 */
export function createIdbThreadStore(): ThreadStore {
	const memory = createMemoryThreadStore();
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
							database.createObjectStore(STORE, { keyPath: 'id' });
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
		async load(id) {
			const database = await open();
			if (!database) return memory.load(id);
			return ((await database.get(STORE, id)) as ThreadRecord | undefined) ?? null;
		},
		async save(thread) {
			const database = await open();
			if (!database) return memory.save(thread);
			await database.put(STORE, plain(thread));
		},
		async list() {
			const database = await open();
			if (!database) return memory.list();
			const all = (await database.getAll(STORE)) as ThreadRecord[];
			return all
				.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }))
				.sort((a, b) => b.updatedAt - a.updatedAt);
		},
		async remove(id) {
			const database = await open();
			if (!database) return memory.remove(id);
			await database.delete(STORE, id);
		}
	};
}

/** A thread title from the first user message. */
export function titleFrom(text: string): string {
	const line = text.trim().split('\n')[0].replace(/\s+/g, ' ');
	return line.length > 60 ? `${line.slice(0, 57)}…` : line || 'new conversation';
}
