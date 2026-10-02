/**
 * Where a preset the agent made waits for the preset maker (`make_kit`, M7): the agent puts a kit
 * here and the preset maker takes it when it opens (or at once, when it is open), so the user can
 * play every key, change it, download it or install it. One kit waits at a time; a newer one
 * replaces it. The other way, the preset maker leaves the drum kit it held here when it closes, so
 * the agent can put the user's own kit on a replica track (the chat is on another page).
 */
import { getContext, hasContext, setContext } from 'svelte';
import type { PcmAudio, SampleInput } from '$lib/core/presets';

/** A kit waiting for the preset maker. */
export interface PresetDraft {
	readonly name: string;
	readonly samples: readonly SampleInput[];
}

/** The drum kit the preset maker last held, its edits written in, as the replica plays it. */
export interface KeptKit {
	readonly name: string;
	readonly sounds: readonly {
		readonly key: number;
		readonly name: string;
		readonly audio: PcmAudio;
	}[];
}

export class PresetInbox {
	/** The kit waiting, if any. */
	draft = $state.raw<PresetDraft | null>(null);
	/** Where the preset maker is, for the agent to link to. */
	readonly href: string;
	#listener: ((draft: PresetDraft) => void) | null = null;
	#kept: KeptKit | null = null;

	constructor(href: string) {
		this.href = href;
	}

	/** The preset maker, closing: the drum kit it held (null for none). */
	keep(kit: KeptKit | null): void {
		this.#kept = kit;
	}

	/** The drum kit the preset maker held when it last closed, if any. */
	keptKit(): KeptKit | null {
		return this.#kept;
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
