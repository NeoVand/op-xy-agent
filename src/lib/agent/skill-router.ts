/**
 * Which skills a request clearly needs, so the harness can add them with the user's message and
 * save the model a round trip (docs/AGENT-V2.md). Deterministic and conservative: an attachment
 * decides by its kind, the words of the message by a few patterns, at most two skills a turn, never
 * one the conversation already holds. A miss costs nothing: the index is in the system prompt and the
 * model loads what it needs itself.
 */

/** What the router looks at. */
export interface RouteInput {
	readonly text: string;
	/** The kinds of the files attached to this message ("midi", "image", "pdf", "text"). */
	readonly attachments?: readonly string[];
	/** Skills already in the conversation. */
	readonly loaded?: ReadonlySet<string>;
}

/** Most skills added to one message. */
export const MAX_ROUTED = 2;

const TEACH =
	/\b(how (do|can|would|should) i|how to|where (is|are|do i|can i|would i)|show me|walk me|guide me|teach me|let me (do|try)|(i want|i'd like) to learn|what does .{1,40} do|what is this (page|screen)|my screen|i'm lost|i am lost)\b/i;
const MAKE =
	/\b(make|write|build|program|create|compose|generate|add|put|give me|turn .{1,40} into|transpose|double|halve|vary|remix|extend)\b/i;
const MUSIC =
	/\b(beat|beats|drums?|groove|bass ?line|chords?|melody|melodies|riff|pattern|loop|song|scenes?|arrangement|verse|chorus|intro|outro|breakdown|fill|arp|jam)\b/i;
const SOUND =
	/\b(sounds?|tone|timbre|filter|cutoff|resonance|envelope|attack|decay|sustain|release|lfo|duck|pump|pumping|sidechain|bright(er)?|dark(er)?|dull|warm(er)?|harsh|thin|fat(ter)?|muddy|plucky|punchy)\b/i;
const DEVICE =
	/\b(put (it|this|that) on|send (it|this|that)|on my (op-?xy|device|unit)|to my (op-?xy|device|unit)|mtp|transfer|project file|\.xy\b|load (the |my )?project|save (it|this) (to|on))\b/i;
const KITS =
	/\b(kits?|samples?|preset maker|one-?shots?|multi-?sample|sound ?font|sf2|sfz|slice|slices|slicing)\b/i;
const LISTEN =
	/\b(how does (it|this|that) sound|how do(es)? (it|they) sound|listen|too loud|too quiet|clipping|mix(ing)?)\b/i;
const APP = /\b(computer keyboard|this app|the app|manual page|undo)\b/i;
const NEW =
	/\b(just (got|bought|unboxed)|new to (this|the op-?xy|music)|where (do|should) i (start|begin)|never (used|made)|beginner|first time|no idea (how|what)|make something (cool|nice|fun)|i don'?t know (anything|much) about)\b/i;
const GEAR =
	/\b(synths?|midi (keyboard|controller|channels?|clock|cc|out|in|cable)|clock|sync|daw|ableton|logic pro|external|multi-?out|din|trs|drum machine|minilogue|korg|roland|moog|elektron|volca|modular|cv)\b/i;
const FORM =
	/\b(song|sections?|intro|verse|chorus|bridge|outro|break(down)?|build ?up|drop|arrange|arrangement|structure)\b/i;
const LIVE = /\b(live|jam|jamming|perform|performance|gig|punch-?in|on the fly)\b/i;

/** The skills to add for `input`, most certain first. */
export function routeSkills(input: RouteInput): string[] {
	const text = input.text;
	const kinds = input.attachments ?? [];
	const wanted: string[] = [];
	const want = (name: string, when: boolean) => {
		if (when && !wanted.includes(name)) wanted.push(name);
	};
	want('midi-to-opxy', kinds.includes('midi'));
	want('sheet-music-and-images', kinds.includes('image') || kinds.includes('pdf'));
	// a how-to question gets the teaching skill alone: a topic skill beside it invites the extras
	// a question did not ask for (the preset maker in an answer about pitching a sample)
	const teaching = TEACH.test(text);
	want('first-steps', NEW.test(text));
	want('teach-on-the-replica', teaching);
	want('midi-gear', GEAR.test(text));
	want('perform-live', LIVE.test(text));
	if (!teaching) {
		want('song-arrangement', FORM.test(text) && (MAKE.test(text) || /\bturn\b/i.test(text)));
		want('make-music', MAKE.test(text) && MUSIC.test(text));
		want('kits-and-samples', KITS.test(text));
		want('shape-a-sound', SOUND.test(text));
		want('projects-and-the-device', DEVICE.test(text));
		want('listening', LISTEN.test(text));
		want('the-app', APP.test(text));
	}
	const loaded = input.loaded ?? new Set<string>();
	return wanted.filter((name) => !loaded.has(name)).slice(0, MAX_ROUTED);
}
