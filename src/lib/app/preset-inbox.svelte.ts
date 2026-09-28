/**
 * Where a preset the agent made waits for the preset maker (`make_kit`, M7): the agent puts a kit
 * here and the preset maker takes it when it opens (or at once, when it is open), so the user can
 * play every key, change it, download it or install it. One kit waits at a time; a newer one
 * replaces it.
 */
import { getContext, hasContext, setContext } from 'svelte';
import type { SampleInput } from '$lib/core/presets';

/** A kit waiting for the preset maker. */
export interface PresetDraft {
	readonly name: string;
	readonly samples: readonly SampleInput[];
}

export class PresetInbox {
	/** The kit waiting, if any. */
	draft = $state.raw<PresetDraft | null>(null);
	/** Where the preset maker is, for the agent to link to. */
	readonly href: string;
	#listener: ((draft: PresetDraft) => void) | null = null;

	constructor(href: string) {
		this.href = href;
	}

	/** Leaves a kit for the preset maker (handed over at once when it is open). */
	put(draft: PresetDraft): void {
		if (this.#listener) this.#listener(draft);
		else this.draft = draft;
	}

	/** The preset maker listens while it is open; a waiting kit comes first. Returns the unlisten. */
	listen(listener: (draft: PresetDraft) => void): () => void {
		this.#listener = listener;
		const waiting = this.draft;
		this.draft = null;
		if (waiting) listener(waiting);
		return () => {
			if (this.#listener === listener) this.#listener = null;
		};
	}
}

const INBOX = Symbol('opxy.app.preset-inbox');

/** Makes the inbox available to every component below (root layout). */
export function setPresetInbox(inbox: PresetInbox): PresetInbox {
	return setContext(INBOX, inbox);
}

/** The inbox, or null outside the app shell. */
export function getPresetInbox(): PresetInbox | null {
	return hasContext(INBOX) ? getContext<PresetInbox>(INBOX) : null;
}
