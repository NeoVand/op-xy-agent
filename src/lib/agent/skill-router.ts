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
	/\b(how (do|can|would|should) i|how to|is there a way to|where (is|are|do i|can i|would i)|show me|walk me|guide me|teach me|let me (do|try)|(i want|i'd like) to learn|what does .{1,40} do|what is this (page|screen)|what am i looking at|my screen|i'm lost|i am lost)\b/i;
/** Something went wrong: the answer is a cause and a fix, not a topic's extras. */
const TROUBLE =
	/\b(why (does|do|is|are|did|won'?t|can'?t|doesn'?t|isn'?t)|what did i do wrong|what'?s wrong|(doesn'?t|does not|won'?t|will not|stopped|stops) (work|play|sound|make)|not working|goes (totally )?silent|keeps? (losing|cutting|dropping|stopping))\b/i;
/** A question about the device's facts or limits. */
const FACT =
	/\b(how (much|many|long|big|heavy|loud)|can i\b|(can|does|is|will) (the|my|an?) op-?xy|what'?s the (max|maximum|limit|longest|size))/i;
const MAKE =
	/\b(make|write|build|program|create|compose|generate|add|put|give me|turn .{1,40} into|transpose|double|halve|vary|remix|extend|change|rewrite|redo|replace|humani[sz]e|quantize|tighten|loosen)\b/i;
const MUSIC =
	/\b(beat|beats|drums?|groove|bass ?lines?|chords?|melody|melodies|riff|pattern|loop|song|scenes?|arrangement|verse|chorus|intro|outro|breakdown|fill|arp|jam|hats|hi-?hats?|velocit(y|ies)|boom ?bap|house|techno|lo-?fi|hip ?hop|trap|drum and bass|dnb|disco|funk|ambient)\b/i;
const SOUND =
	/\b(tone|timbre|filter|cutoff|resonance|envelope|attack|decay|sustain|release|lfo|duck|pump|pumping|sidechain|bright(er)?|dark(er)?|dull|warm(er)?|harsh|thin|fat(ter)?|muddy|plucky|punchy|sounds? (so |too |a bit |more |less )?(better|worse|good|bad|nicer|bigger|fuller|like))\b/i;
/** Words for how something sounds, which make a question one for the sound skill. */
const TIMBRE =
	/\b(bright|dark|dull|warm|harsh|thin|fat|muddy|boomy|tinny|weak|flat|lifeless|plucky|punchy)\b/i;
const DEVICE =
	/\b((on|to) (my|the) (op-?xy|device|unit|real one)|mtp|transfer|project file|\.xy\b|load (the |my )?project|save (it|this) (to|on))\b/i;
const KITS =
	/\b(kits?|samples?|preset maker|one-?shots?|multi-?sample|sound ?font|sf2|sfz|slice|slices|slicing)\b/i;
const LISTEN =
	/\b(how does (it|this|that) sound|how do(es)? (it|they) sound|listen|too loud|too quiet|clipping|mix(ing)?)\b/i;
const APP =
	/\b(computer keyboard|this app|the app|manual page|export|bounce|wav|mp3|audio file|sound file|download (it|this|the song|my song))\b/i;
const NEW =
	/\b(just (got|bought|unboxed)|new to (this|the op-?xy|music)|where (do|should) i (start|begin)|never (used|made)|beginner|first time|no idea (how|what)|make something (cool|nice|fun)|i don'?t know (anything|much) about)\b/i;
const GEAR =
	/\b(synths?|midi (keyboard|controller|channels?|clock|cc|out|in|cable)|clock|sync|external|multi-?out|din|trs|drum machine|minilogue|korg|roland|moog|elektron|volca|modular|cv)\b/i;
/** A computer program the user wants the OP-XY to work with (not "like in a daw"). */
const DAW =
	/\b((to|with|into|from|and) (my |a |the )?(daw|ableton|logic( pro)?|bitwig|fl studio|cubase)|(daw|ableton|bitwig) (sync|clock|midi))\b/i;
const FORM =
	/\b(song|sections?|intro|verse|chorus|bridge|outro|break(down)?|build ?up|drop|arrange|arrangement|structure)\b/i;
const LIVE =
	/\b(live|jam (over|along|with)|jamming|perform|performance|gig|punch-?in|on the fly)\b/i;
/** Options for the user to choose between by ear: takes offered from the lab. */
const TAKES =
	/\b((two|three|four|a few|a couple( of)?|several|\d) (options|versions|takes|variations|variants|alternatives|ideas|bass ?lines?|beats|grooves|kits|melodies|patterns|sounds)|to (choose|pick) (from|between)|(let|help) me (choose|pick)|compare (them|options|versions))\b/i;

/** The skills to add for `input`, most certain first. */
export function routeSkills(input: RouteInput): string[] {
	const text = input.text;
	const kinds = input.attachments ?? [];
	const wanted: string[] = [];
	const want = (name: string, when: boolean) => {
		if (when && !wanted.includes(name)) wanted.push(name);
	};
	want('midi-to-opxy', kinds.includes('midi'));
	// a file's parts are arranged by comparing mappings in one program
	want('lab', kinds.includes('midi'));
	want('sheet-music-and-images', kinds.includes('image') || kinds.includes('pdf'));
	// A question gets the teaching skill at most, and the sound skill when it is about how something
	// sounds: a topic skill beside it invites the extras a question did not ask for (the preset
	// maker in an answer about a sample pitched across the keys). Topic skills come with requests.
	const teaching = TEACH.test(text);
	const asking = teaching || TROUBLE.test(text) || FACT.test(text);
	want('first-steps', NEW.test(text));
	want('teach-on-the-replica', teaching);
	want('midi-gear', GEAR.test(text) || DAW.test(text));
	want('perform-live', LIVE.test(text));
	// the app's own features are asked about more than requested ("how do I export a wav?")
	want('the-app', APP.test(text));
	if (asking) {
		want('shape-a-sound', TIMBRE.test(text));
	} else {
		// options to choose between by ear come from the lab, offered as takes
		want('lab', TAKES.test(text));
		want('song-arrangement', FORM.test(text) && (MAKE.test(text) || /\bturn\b/i.test(text)));
		want('make-music', MAKE.test(text) && MUSIC.test(text));
		want('kits-and-samples', KITS.test(text));
		want('shape-a-sound', SOUND.test(text));
		want('projects-and-the-device', DEVICE.test(text));
		want('listening', LISTEN.test(text));
	}
	const loaded = input.loaded ?? new Set<string>();
	return wanted.filter((name) => !loaded.has(name)).slice(0, MAX_ROUTED);
}
