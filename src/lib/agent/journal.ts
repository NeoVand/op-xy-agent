/**
 * The revision journal: every device change the agent applies is recorded with what it changed,
 * the call that undoes it, the firmware it was sent to and the tool call that caused it
 * (VISION: "undo is sacred"). Undo is offered only while the page session that made the change is
 * still running: after a reload the device may have been changed by hand, so old revisions are kept
 * as history but not undone blindly.
 */
import type { InverseCall, Revision } from './types';

/** What the executor records for one applied change. */
export interface RevisionInput {
	readonly tool: string;
	readonly label: string;
	readonly input: Readonly<Record<string, unknown>>;
	readonly inverse: InverseCall | null;
	readonly before: unknown;
	readonly after: unknown;
	readonly firmware: string | null;
	readonly toolCallId: string;
	readonly agent: string;
	readonly undoes?: number | null;
}

/** Constructor options. */
export interface JournalOptions {
	/** Identifies this page session (a random id per load). */
	readonly session: string;
	/** Thread the revisions belong to. */
	readonly threadId: string;
	/** Epoch ms (injectable for tests). */
	readonly now?: () => number;
	/** Revisions restored from storage. */
	readonly restore?: readonly Revision[];
}

/** Append-only list of applied changes. */
export class Journal {
	readonly #session: string;
	readonly #now: () => number;
	#threadId: string;
	#revisions: Revision[];
	#listener: ((revisions: readonly Revision[]) => void) | null = null;

	constructor(options: JournalOptions) {
		this.#session = options.session;
		this.#threadId = options.threadId;
		this.#now = options.now ?? (() => Date.now());
		this.#revisions = (options.restore ?? []).map((r) => ({ ...r }));
	}

	/** The page session id. */
	get session(): string {
		return this.#session;
	}

	/** Every revision, oldest first. */
	list(): readonly Revision[] {
		return this.#revisions;
	}

	/** Calls `listener` with a copy of the list after every change. */
	onChange(listener: ((revisions: readonly Revision[]) => void) | null): void {
		this.#listener = listener;
	}

	/** Switches to another thread's revisions. */
	reset(threadId: string, restore: readonly Revision[] = []): void {
		this.#threadId = threadId;
		this.#revisions = restore.map((r) => ({ ...r }));
		this.#emit();
	}

	/** Records an applied change and returns it. */
	record(input: RevisionInput): Revision {
		const last = this.#revisions.at(-1);
		const revision: Revision = {
			rev: (last?.rev ?? 0) + 1,
			tool: input.tool,
			label: input.label,
			input: input.input,
			inverse: input.inverse,
			before: input.before,
			after: input.after,
			firmware: input.firmware,
			toolCallId: input.toolCallId,
			agent: input.agent,
			threadId: this.#threadId,
			session: this.#session,
			at: this.#now(),
			undoes: input.undoes ?? null,
			undoneBy: null
		};
		this.#revisions.push(revision);
		if (revision.undoes !== null) {
			const target = this.#revisions.find((r) => r.rev === revision.undoes);
			if (target) target.undoneBy = revision.rev;
		}
		this.#emit();
		return revision;
	}

	/** A revision by number. */
	get(rev: number): Revision | undefined {
		return this.#revisions.find((r) => r.rev === rev);
	}

	/**
	 * Why a revision cannot be undone, or null when it can: it has an inverse, was made in this
	 * page session and has not been undone already.
	 */
	undoBlocker(rev: number): string | null {
		const revision = this.get(rev);
		if (!revision) return `there is no revision ${rev}`;
		if (revision.undoneBy !== null) return `revision ${rev} was already undone`;
		if (!revision.inverse) return 'the state before this change is unknown, so it cannot be undone';
		if (revision.session !== this.#session) {
			return 'this change was made before the page was reloaded; the device may have changed since';
		}
		return null;
	}

	#emit(): void {
		this.#listener?.(this.#revisions.map((r) => ({ ...r })));
	}
}
