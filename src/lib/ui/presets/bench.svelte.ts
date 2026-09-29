/**
 * The preset maker's workbench: the sounds on the OP-XY's 24 keys, for each kind of preset, and
 * everything done to them (docs/research/30-presets-samples.md). Dropped files are decoded and put
 * where they belong at once: a drum kit by what each sound is (`core/presets/classify`), a loop cut
 * at its hits, a multisample by its roots, a synth sampler as its one sound. Keys swap, sounds are
 * edited (`core/presets/edit`), generated kits are turned and mutated, and `build()` writes the
 * `.preset`. State is `$state.raw` and replaced, never mutated: a sound's arrays are large, and
 * every change is a new object the views and the preview cache can compare.
 */
import {
	DRUM_FIRST_KEY,
	DRUM_KEYS,
	MAX_SECONDS,
	MAX_ZONES,
	PRESET_RATE,
	TE_LAYOUT,
	buildPreset,
	classifyDrum,
	clampEdit,
	defaultEdit,
	detectNote,
	drumFeatures,
	equalSlices,
	findOnsets,
	generateKit,
	guessMode,
	loopTempo,
	mutateVoice,
	noteFromName,
	overview,
	placeDrums,
	presetProblems,
	presetStats,
	randomKit,
	renderVoice,
	resample,
	safeName,
	sliceAudio,
	soundFontSamples,
	slotFromName,
	zonesFor,
	type BenchMode,
	type BuiltPreset,
	type DrumKind,
	type ImportedPreset,
	type KitStyle,
	type LoopTempo,
	type PcmAudio,
	type PresetKind,
	type PresetProblem,
	type SampleInput,
	type SoundEdit,
	type SoundFont,
	type Voice,
	type VoiceParam,
	type VoiceType,
	type Zone
} from '$lib/core/presets';

/** Where a sound's drum kind or root note came from. */
export type Provenance =
	'name' | 'sound' | 'file' | 'pitch' | 'you' | 'generated' | 'slice' | 'guess';

/** One sound on the workbench. */
export interface BenchSound {
	readonly id: number;
	/** What it is called (its file name without the extension). */
	readonly name: string;
	/** At the preset rate, at most 20 s. */
	readonly audio: PcmAudio;
	/** The whole sound's overview for its key (64 columns). */
	readonly peaks: Float32Array;
	/** Drum kits: what kind of sound it is, from where, and why. */
	readonly kind: DrumKind | null;
	readonly kindFrom: Provenance | null;
	readonly reason: string;
	/** Its pitch in Hz, when it has one (orders toms and congas). */
	readonly pitch: number | null;
	/** Instruments: the note it was played at. */
	readonly root: number | null;
	readonly rootFrom: Provenance | null;
	/** Generated sounds: the voice they are rendered from. */
	readonly voice: Voice | null;
	readonly edit: SoundEdit;
}

/** How a loop is cut: at its hits, or into equal parts. */
export type Cut = 'hits' | '8' | '16' | '24';

/** The workbench as it stood, for undo. */
interface Snapshot {
	readonly mode: BenchMode;
	readonly name: string;
	readonly source: string;
	readonly kit: (BenchSound | null)[];
	readonly loop: BenchSound | null;
	readonly cuts: number[];
	readonly cut: Cut;
	readonly sensitivity: number;
	readonly tempo: LoopTempo | null;
	readonly sliceEdits: Partial<SoundEdit>[];
	readonly zones: BenchSound[];
	readonly one: BenchSound | null;
	readonly selected: number | null;
	readonly octave: number;
	readonly soundFont: SoundFont | null;
	readonly soundFontPreset: number;
}

/** The last thing the workbench did, for the screen's message line. */
export interface BenchNote {
	readonly text: string;
	readonly at: number;
}

const KEYS = DRUM_KEYS;
const emptyKeys = (): (BenchSound | null)[] => Array.from({ length: KEYS }, () => null);
const stem = (file: string) => file.replace(/\.[a-z0-9]{2,5}$/i, '');

/** A sound's frames as written (the builder crops each to its region). */
const frames = (s: BenchSound) => s.edit.end - s.edit.start;

let nextId = 1;

/** The drum kind each generated voice type is. */
const VOICE_KIND: Readonly<Record<VoiceType, DrumKind>> = {
	kick: 'kick',
	snare: 'snare',
	clap: 'clap',
	rim: 'rim',
	'closed hat': 'closed hat',
	'open hat': 'open hat',
	cymbal: 'crash',
	tom: 'tom',
	conga: 'conga',
	cowbell: 'cowbell',
	clave: 'clave',
	shaker: 'shaker',
	tambourine: 'tambourine',
	triangle: 'triangle',
	guiro: 'guiro',
	zap: 'fx'
};

/** Kinds one voice can stand for on TE's keys (a cymbal on the ride key is the ride). */
const sameFamily = (a: DrumKind, b: DrumKind) =>
	a === b ||
	(['crash', 'ride'].includes(a) && ['crash', 'ride'].includes(b)) ||
	(['cowbell', 'metal'].includes(a) && ['cowbell', 'metal'].includes(b));

/** Audio at the preset rate, at most 20 s (a longer one is cut, and says so). */
function atPresetRate(audio: PcmAudio): { audio: PcmAudio; cut: boolean } {
	// cut first, at the file's own rate: resampling five minutes to keep twenty seconds would stall
	const keep = Math.ceil(MAX_SECONDS * audio.sampleRate) + 64;
	const long = (audio.channels[0]?.length ?? 0) > keep;
	const source = audio.channels.slice(0, 2).map((c) => (long ? c.subarray(0, keep) : c));
	let channels = resample(source, audio.sampleRate, PRESET_RATE);
	const max = MAX_SECONDS * PRESET_RATE;
	const cut = long || channels[0].length > max;
	if (channels[0].length > max) channels = channels.map((c) => c.slice(0, max));
	return { audio: { sampleRate: PRESET_RATE, channels, root: audio.root }, cut };
}

/** A new sound for the workbench from audio at the preset rate. */
function makeSound(
	name: string,
	audio: PcmAudio,
	kind: PresetKind,
	extra: Partial<Omit<BenchSound, 'id' | 'name' | 'audio' | 'peaks'>> = {}
): BenchSound {
	return {
		id: nextId++,
		name,
		audio,
		peaks: overview(audio, 64),
		kind: null,
		kindFrom: null,
		reason: '',
		pitch: null,
		root: null,
		rootFrom: null,
		voice: null,
		edit: defaultEdit(audio, kind),
		...extra
	};
}

/** The workbench. Create one per preset maker. */
export class Workbench {
	/** What is being made. */
	mode = $state<BenchMode>('drum');
	/** The preset's name as typed. */
	name = $state('');
	/** Drum kit: the sound on each key, 53 upwards. */
	kit = $state.raw<(BenchSound | null)[]>(emptyKeys());
	/** Sliced loop: the loop, where it is cut, and its tempo. */
	loop = $state.raw<BenchSound | null>(null);
	cuts = $state.raw<number[]>([]);
	cut = $state<Cut>('hits');
	sensitivity = $state(50);
	tempo = $state.raw<LoopTempo | null>(null);
	/** Slices: each slice's own changes (level, pan, pitch, reverse, play mode), by index. */
	sliceEdits = $state.raw<Partial<SoundEdit>[]>([]);
	/** Multisample: its zones' sounds (roots distinct). */
	zones = $state.raw<BenchSound[]>([]);
	/** Synth sampler: its one sound. */
	one = $state.raw<BenchSound | null>(null);
	/** The sound being edited (its id). */
	selected = $state<number | null>(null);
	/** The key last pressed or picked (53–76 at the keyboard's octave). */
	key = $state<number | null>(null);
	/** Instruments: the keyboard's octave (−3…+3), as [-] and [+] move it. */
	octave = $state(0);
	/** Normalise every sound to −1 dBFS on export. */
	normalize = $state(false);
	/** What the workbench just did. */
	note = $state.raw<BenchNote | null>(null);
	/** Files being read. */
	busy = $state(false);

	/** The slices of the loop, as drum sounds on keys 53 upwards. */
	readonly slices = $derived.by((): BenchSound[] => {
		const loop = this.loop;
		if (!loop) return [];
		return sliceAudio(loop.audio, this.cuts).map((audio, i) => {
			const own = this.sliceEdits[i] ?? {};
			const base = defaultEdit(audio, 'drum', { trim: false });
			return {
				id: -(i + 1),
				name: `${stem(loop.name).slice(0, 10)} ${String(i + 1).padStart(2, '0')}`,
				audio,
				peaks: overview(audio, 64),
				kind: null,
				kindFrom: 'slice',
				reason: `slice ${i + 1} of ${this.cuts.length}`,
				pitch: null,
				root: null,
				rootFrom: null,
				voice: null,
				edit: clampEdit(
					{ ...base, fadeOut: 0, playmode: 'group', ...own },
					audio.channels[0].length
				)
			};
		});
	});

	/** The sound on each of the 24 keys at the keyboard's octave, in drum kits and slices. */
	readonly keys = $derived.by((): (BenchSound | null)[] => {
		if (this.mode === 'drum') return this.kit;
		if (this.mode === 'slices') {
			const out = emptyKeys();
			this.slices.forEach((s, i) => (out[i] = s));
			return out;
		}
		return emptyKeys();
	});

	/** Multisample zones as they spread over all 128 notes. */
	readonly zoneMap = $derived.by((): Zone[] =>
		this.mode === 'multisampler'
			? zonesFor(this.zones.map((z) => z.root ?? 60))
			: this.one
				? [{ root: this.one.root ?? 60, low: 0, high: 127 }]
				: []
	);

	/** Every sound of the current preset. */
	readonly sounds = $derived.by((): BenchSound[] => {
		switch (this.mode) {
			case 'drum':
				return this.kit.filter((s): s is BenchSound => s !== null);
			case 'slices':
				return this.slices;
			case 'multisampler':
				return this.zones;
			case 'sampler':
				return this.one ? [this.one] : [];
		}
	});

	/** The sound being edited. */
	readonly current = $derived.by((): BenchSound | null => {
		if (this.mode === 'slices' && this.selected === null) return null;
		return this.sounds.find((s) => s.id === this.selected) ?? null;
	});

	/** The preset kind the mode writes. */
	readonly kind = $derived<PresetKind>(this.mode === 'slices' ? 'drum' : this.mode);

	/** Where the sounds came from (a dropped folder's name), for the preset's name. */
	source = $state('');

	/**
	 * The name the preset gets: typed, else the dropped folder's, else one from its sounds (the
	 * loop's name, the instrument's name without its note, the one sound's).
	 */
	readonly presetName = $derived.by((): string => {
		const typed = this.name.trim();
		if (typed) return typed;
		if (this.source) return this.source;
		const first = this.sounds[0];
		switch (this.mode) {
			case 'slices':
				return this.loop ? stem(this.loop.name) : '';
			case 'multisampler':
				return first
					? stem(first.name)
							.replace(/[\s_-]*[a-g](#|b|s)?-?\d\b.*$/i, '')
							.trim() || 'multisample'
					: '';
			case 'sampler':
				return first ? stem(first.name) : '';
			case 'drum':
				return first ? 'new kit' : '';
		}
	});

	/** The folder the device will list. */
	readonly folder = $derived(`${safeName(this.presetName || 'untitled', 24)}.preset`);

	readonly stats = $derived(
		presetStats(this.sounds.map((s) => ({ frames: frames(s), channels: s.audio.channels.length })))
	);

	/** What the device would refuse or take differently (nothing to say while it is empty). */
	readonly problems = $derived.by((): PresetProblem[] =>
		this.sounds.length === 0
			? []
			: presetProblems(this.name, this.stats, {
					zones: this.mode === 'multisampler',
					overflow: this.mode === 'multisampler' ? Math.max(0, this.zones.length - MAX_ZONES) : 0
				})
	);

	/** Whether anything is on the workbench, in any mode. */
	readonly empty = $derived(
		this.kit.every((s) => s === null) && !this.loop && this.zones.length === 0 && !this.one
	);

	/** Says what just happened on the screen's message line. */
	say(text: string): void {
		this.note = { text, at: Date.now() };
	}

	// ---------------------------------------------------------------- undo

	/** Whether there is something to undo. */
	canUndo = $state(false);
	/** Earlier states, newest last (the sounds are immutable, so a state is a few references). */
	#past: Snapshot[] = [];
	#lastTag = '';
	#lastAt = 0;

	#snapshot(): Snapshot {
		return {
			mode: this.mode,
			name: this.name,
			source: this.source,
			kit: this.kit,
			loop: this.loop,
			cuts: this.cuts,
			cut: this.cut,
			sensitivity: this.sensitivity,
			tempo: this.tempo,
			sliceEdits: this.sliceEdits,
			zones: this.zones,
			one: this.one,
			selected: this.selected,
			octave: this.octave,
			soundFont: this.soundFont,
			soundFontPreset: this.soundFontPreset
		};
	}

	/**
	 * Keeps the state before a change. One gesture is one step: the same change repeated within
	 * a moment (a drag, a knob turning) adds none, nor does a change made inside another.
	 */
	#save(tag: string, merge = true): void {
		const now = Date.now();
		const inside = now - this.#lastAt < 30;
		const same = merge && tag === this.#lastTag && now - this.#lastAt < 900;
		this.#lastAt = now;
		if (inside || same) return;
		this.#lastTag = tag;
		this.#past.push(this.#snapshot());
		if (this.#past.length > 60) this.#past.shift();
		this.canUndo = true;
	}

	/** Puts the workbench back as it was before the last change. */
	undo(): boolean {
		const s = this.#past.pop();
		this.canUndo = this.#past.length > 0;
		if (!s) return false;
		this.mode = s.mode;
		this.name = s.name;
		this.source = s.source;
		this.kit = s.kit;
		this.loop = s.loop;
		this.cuts = s.cuts;
		this.cut = s.cut;
		this.sensitivity = s.sensitivity;
		this.tempo = s.tempo;
		this.sliceEdits = s.sliceEdits;
		this.zones = s.zones;
		this.one = s.one;
		this.selected = s.selected;
		this.octave = s.octave;
		this.soundFont = s.soundFont;
		this.soundFontPreset = s.soundFontPreset;
		this.#lastTag = '';
		this.#lastAt = 0;
		this.say('undone');
		return true;
	}

	/** The user picked the mode: a drop fills it rather than choosing one of its own. */
	#chosen = false;

	/** Switches what is being made (each mode keeps its own sounds). */
	setMode(mode: BenchMode): void {
		this.#chosen = true;
		this.mode = mode;
		this.selected = this.sounds[0]?.id ?? null;
	}

	/**
	 * Adds decoded files: into the current mode, or when the workbench is empty (and no mode was
	 * picked) into the mode they want to be (a loop is sliced, several notes a multisample). `key`
	 * drops them on one key.
	 */
	add(dropped: readonly { name: string; audio: PcmAudio }[], key?: number): void {
		this.#save('add', false);
		if (dropped.length === 0) return;
		const cut: string[] = [];
		const sounds = dropped.map((d) => {
			const { audio, cut: long } = atPresetRate(d.audio);
			if (long) cut.push(d.name);
			return { name: d.name, audio };
		});
		if (this.empty && key === undefined && !this.#chosen) {
			const guess = guessMode(sounds);
			this.mode = guess.mode;
			this.say(guess.reason);
		}
		switch (this.mode) {
			case 'drum':
				this.#addDrums(sounds, key);
				break;
			case 'slices':
				this.#setLoop(sounds[0]);
				break;
			case 'multisampler':
				this.#addZones(sounds, key);
				break;
			case 'sampler':
				this.#setOne(sounds[0], key);
				break;
		}
		if (cut.length > 0)
			this.say(`over ${MAX_SECONDS} s, cut at ${MAX_SECONDS} s: ${cut.join(', ')}`);
	}

	#addDrums(sounds: readonly { name: string; audio: PcmAudio }[], key?: number): void {
		const made = sounds.map((d) => {
			const guess = classifyDrum(d.name, d.audio);
			const features = drumFeatures(d.audio);
			return makeSound(stem(d.name), d.audio, 'drum', {
				kind: guess.kind,
				kindFrom: guess.from,
				reason: guess.reason,
				pitch: features.pitch > 0 ? features.pitch : null
			});
		});
		const kit = [...this.kit];
		let rest = made;
		if (key !== undefined) {
			kit[key - DRUM_FIRST_KEY] = made[0];
			rest = made.slice(1);
		}
		const taken = kit.flatMap((s, i) => (s ? [DRUM_FIRST_KEY + i] : []));
		const keys = placeDrums(
			rest.map((s) => {
				const kind = s.kind ?? 'perc';
				return { kind, pitch: s.pitch ?? undefined, prefer: slotFromName(s.name, kind) };
			}),
			taken
		);
		let left = 0;
		rest.forEach((s, i) => {
			const k = keys[i];
			if (k === null) left++;
			else kit[k - DRUM_FIRST_KEY] = s;
		});
		this.kit = kit;
		this.selected = made[0].id;
		this.key = kit.findIndex((s) => s?.id === made[0].id) + DRUM_FIRST_KEY;
		if (left > 0) this.say(`the kit is full: ${left} left out`);
		else if (made.length > 1 && key === undefined) {
			const named = made.filter((s) => s.kindFrom === 'name').length;
			this.say(
				`${made.length} sounds placed as TE lays out a kit: ${named} by name, ${made.length - named} by ear`
			);
		} else {
			this.say(
				`${made[0].name}: ${made[0].kind}, ${made[0].kindFrom === 'name' ? 'by its name' : made[0].reason}`
			);
		}
	}

	#setLoop(d: { name: string; audio: PcmAudio }): void {
		const loop = makeSound(stem(d.name), d.audio, 'drum', {
			edit: defaultEdit(d.audio, 'drum', { trim: false })
		});
		this.loop = loop;
		this.sliceEdits = [];
		this.tempo = loopTempo(loop.audio, findOnsets(loop.audio));
		this.recut();
		this.selected = this.slices[0]?.id ?? null;
		this.key = DRUM_FIRST_KEY;
		const tempo = this.tempo ? `, ${this.tempo.bpm} bpm` : '';
		this.say(`${loop.name}: ${this.cuts.length} slices${tempo}, each choking the last`);
	}

	/** Cuts the loop again, at its hits (at the sensitivity) or into equal parts. */
	recut(): void {
		this.#save('recut');
		const loop = this.loop;
		if (!loop) {
			this.cuts = [];
			return;
		}
		this.cuts =
			this.cut === 'hits'
				? findOnsets(loop.audio, { sensitivity: this.sensitivity / 100 })
				: equalSlices(loop.audio, Number(this.cut));
		if (this.cuts.length === 0) this.cuts = [0];
	}

	/** Moves one cut of the loop (frames), keeping the cuts in order. */
	moveCut(index: number, frame: number): void {
		this.#save(`cut ${index}`);
		const cuts = [...this.cuts];
		const lo = index > 0 ? cuts[index - 1] + 64 : 0;
		const hi =
			index + 1 < cuts.length
				? cuts[index + 1] - 64
				: (this.loop?.audio.channels[0].length ?? 0) - 64;
		cuts[index] =
			index === 0
				? Math.max(0, Math.min(hi, Math.round(frame)))
				: Math.max(lo, Math.min(hi, Math.round(frame)));
		this.cuts = cuts;
	}

	/** Adds a cut at `frame` (at most 24 slices). */
	addCut(frame: number): void {
		this.#save('add cut', false);
		if (this.cuts.length >= KEYS || !this.loop) return;
		const at = Math.round(frame);
		if (this.cuts.some((c) => Math.abs(c - at) < 256)) return;
		const cuts = [...this.cuts, at].sort((a, b) => a - b);
		const index = cuts.indexOf(at);
		const edits = [...this.sliceEdits];
		edits.splice(index, 0, {});
		this.sliceEdits = edits;
		this.cuts = cuts;
	}

	/** Takes a cut away (the first stays: the loop starts there). */
	removeCut(index: number): void {
		this.#save('remove cut', false);
		if (index <= 0 || index >= this.cuts.length) return;
		this.cuts = this.cuts.filter((_, i) => i !== index);
		this.sliceEdits = this.sliceEdits.filter((_, i) => i !== index);
	}

	#addZones(sounds: readonly { name: string; audio: PcmAudio }[], key?: number): void {
		const zones = [...this.zones];
		let unknown = 0;
		sounds.forEach((d, i) => {
			const fromFile = d.audio.root;
			const fromName = noteFromName(d.name);
			const heard = fromFile === undefined && fromName === null ? detectNote(d.audio) : null;
			let root = key !== undefined ? this.noteOf(key) + i : (fromFile ?? fromName ?? heard);
			const rootFrom: Provenance =
				key !== undefined
					? 'you'
					: fromFile !== undefined
						? 'file'
						: fromName !== null
							? 'name'
							: heard !== null
								? 'pitch'
								: 'guess';
			if (root === null || root === undefined) {
				unknown++;
				root = 60;
				while (zones.some((z) => z.root === root) && root < 127) root++;
			}
			const sound = makeSound(stem(d.name), d.audio, 'multisampler', { root, rootFrom });
			const same = zones.findIndex((z) => z.root === root);
			if (same >= 0) zones[same] = sound;
			else zones.push(sound);
		});
		zones.sort((a, b) => (a.root ?? 0) - (b.root ?? 0));
		this.zones = zones;
		const first = zones.find((z) => z.name === stem(sounds[0].name));
		this.selected = first?.id ?? zones[0]?.id ?? null;
		this.#centre();
		this.say(
			unknown > 0
				? `${unknown} without a root note: set it on the loop page`
				: `${zones.length} zones across the keyboard`
		);
	}

	#setOne(d: { name: string; audio: PcmAudio }, key?: number): void {
		const fromFile = d.audio.root;
		const fromName = noteFromName(d.name);
		const heard = fromFile === undefined && fromName === null ? detectNote(d.audio) : null;
		const root =
			(key !== undefined ? this.noteOf(key) : undefined) ?? fromFile ?? fromName ?? heard ?? 60;
		const rootFrom: Provenance =
			key !== undefined
				? 'you'
				: fromFile !== undefined
					? 'file'
					: fromName !== null
						? 'name'
						: heard !== null
							? 'pitch'
							: 'guess';
		this.one = makeSound(stem(d.name), d.audio, 'sampler', { root, rootFrom });
		this.selected = this.one.id;
		this.#centre();
		this.say(
			`${this.one.name} across the keyboard, its root ${rootFrom === 'guess' ? 'set to c4' : 'found'}`
		);
	}

	/** Moves the keyboard's octave so the selected zone's root is on the keys. */
	#centre(): void {
		const root = this.current?.root;
		if (root === null || root === undefined) return;
		this.octave = Math.max(-3, Math.min(3, Math.floor((root - DRUM_FIRST_KEY) / 12)));
	}

	/** The note a key plays at the keyboard's octave. */
	noteOf(key: number): number {
		return this.mode === 'multisampler' || this.mode === 'sampler' ? key + 12 * this.octave : key;
	}

	/** Picks a key: its sound (or zone) becomes the one being edited. */
	pick(key: number): void {
		this.key = key;
		if (this.mode === 'drum' || this.mode === 'slices') {
			const sound = this.keys[key - DRUM_FIRST_KEY];
			if (sound) this.selected = sound.id;
			return;
		}
		if (this.mode === 'multisampler') {
			const note = this.noteOf(key);
			const zone = this.zoneMap.find((z) => note >= z.low && note <= z.high);
			const sound = zone && this.zones.find((z) => z.root === zone.root);
			if (sound) this.selected = sound.id;
		}
	}

	/** The sound a key plays and how far it is pitched (semitones), or null for an empty key. */
	voiceFor(key: number): { sound: BenchSound; semitones: number } | null {
		if (this.mode === 'drum' || this.mode === 'slices') {
			const sound = this.keys[key - DRUM_FIRST_KEY];
			return sound ? { sound, semitones: sound.edit.transpose } : null;
		}
		const note = this.noteOf(key);
		if (this.mode === 'sampler') {
			return this.one
				? { sound: this.one, semitones: note - (this.one.root ?? 60) + this.one.edit.tune / 100 }
				: null;
		}
		const zone = this.zoneMap.find((z) => note >= z.low && note <= z.high);
		const sound = zone && this.zones.find((z) => z.root === zone.root);
		return sound ? { sound, semitones: note - (sound.root ?? 60) + sound.edit.tune / 100 } : null;
	}

	/** Swaps two keys of the kit (drum kits), or moves a zone's root (multisample). */
	move(from: number, to: number): void {
		this.#save('move', false);
		if (from === to) return;
		if (this.mode === 'drum') {
			const kit = [...this.kit];
			const a = from - DRUM_FIRST_KEY;
			const b = to - DRUM_FIRST_KEY;
			[kit[a], kit[b]] = [kit[b], kit[a]];
			this.kit = kit;
			this.key = to;
			return;
		}
		if (this.mode === 'multisampler') {
			const noteFrom = this.noteOf(from);
			const noteTo = this.noteOf(to);
			const moving = this.zones.find((z) => z.root === noteFrom);
			if (!moving) return;
			this.zones = this.zones
				.map((z) =>
					z.id === moving.id
						? { ...z, root: noteTo, rootFrom: 'you' as const }
						: z.root === noteTo
							? { ...z, root: noteFrom, rootFrom: 'you' as const }
							: z
				)
				.sort((a, b) => (a.root ?? 0) - (b.root ?? 0));
			this.key = to;
		}
	}

	/** Takes a sound off the workbench. */
	remove(id: number): void {
		this.#save('remove', false);
		if (this.mode === 'drum') this.kit = this.kit.map((s) => (s?.id === id ? null : s));
		else if (this.mode === 'multisampler') this.zones = this.zones.filter((z) => z.id !== id);
		else if (this.mode === 'sampler' && this.one?.id === id) this.one = null;
		else if (this.mode === 'slices') {
			const index = -id - 1;
			if (index === 0) {
				this.loop = null;
				this.cuts = [];
			} else this.removeCut(index);
		}
		if (this.selected === id) this.selected = this.sounds[0]?.id ?? null;
	}

	/** Empties the current mode. */
	clear(): void {
		this.#save('clear', false);
		if (this.mode === 'drum') this.kit = emptyKeys();
		else if (this.mode === 'slices') {
			this.loop = null;
			this.cuts = [];
			this.sliceEdits = [];
			this.tempo = null;
		} else if (this.mode === 'multisampler') this.zones = [];
		else this.one = null;
		this.selected = null;
		this.say('cleared');
	}

	/** Changes a sound's edit (kept valid and in the device's ranges). */
	edit(id: number, change: Partial<SoundEdit>): void {
		this.#save(`edit ${id} ${Object.keys(change).join()}`);
		this.#update(id, (s) => ({
			...s,
			edit: clampEdit({ ...s.edit, ...change }, s.audio.channels[0].length)
		}));
		if (this.mode === 'slices' && id < 0) {
			const index = -id - 1;
			const edits = [...this.sliceEdits];
			edits[index] = { ...edits[index], ...change };
			this.sliceEdits = edits;
		}
	}

	/** Sets an instrument sound's root note (moving any zone already there out of the way). */
	setRoot(id: number, root: number): void {
		this.#save(`root ${id}`);
		const r = Math.max(0, Math.min(127, Math.round(root)));
		if (this.mode === 'sampler') {
			this.#update(id, (s) => ({ ...s, root: r, rootFrom: 'you' }));
			return;
		}
		if (this.zones.some((z) => z.root === r && z.id !== id)) return;
		this.zones = this.zones
			.map((z) => (z.id === id ? { ...z, root: r, rootFrom: 'you' as const } : z))
			.sort((a, b) => (a.root ?? 0) - (b.root ?? 0));
	}

	/** Says a drum sound is another kind (the key stays where it is). */
	setKind(id: number, kind: DrumKind): void {
		this.#save('kind', false);
		this.#update(id, (s) => ({ ...s, kind, kindFrom: 'you', reason: 'you said so' }));
	}

	#update(id: number, change: (s: BenchSound) => BenchSound): void {
		if (this.mode === 'drum') this.kit = this.kit.map((s) => (s?.id === id ? change(s) : s));
		else if (this.mode === 'multisampler')
			this.zones = this.zones.map((z) => (z.id === id ? change(z) : z));
		else if (this.mode === 'sampler' && this.one?.id === id) this.one = change(this.one);
	}

	/** Puts a whole kit on the keys (generated here, or made by the agent's make_kit). */
	useKit(name: string, samples: readonly SampleInput[]): void {
		this.#save('kit', false);
		const kit = emptyKeys();
		const loose: SampleInput[] = [];
		for (const s of samples) {
			const at = (s.key ?? 0) - DRUM_FIRST_KEY;
			if (at >= 0 && at < KEYS && !kit[at]) kit[at] = this.#fromInput(s, at);
			else loose.push(s);
		}
		const taken = kit.flatMap((s, i) => (s ? [DRUM_FIRST_KEY + i] : []));
		const extra = loose.map((s) => this.#fromInput(s, -1));
		placeDrums(
			extra.map((s) => ({ kind: s.kind ?? 'perc', pitch: s.pitch ?? undefined })),
			taken
		).forEach((k, i) => {
			if (k !== null) kit[k - DRUM_FIRST_KEY] = extra[i];
		});
		this.mode = 'drum';
		this.name = name;
		this.kit = kit;
		const first = kit.find((s) => s !== null);
		this.selected = first?.id ?? null;
		this.key = first ? kit.indexOf(first) + DRUM_FIRST_KEY : null;
	}

	#fromInput(s: SampleInput, slot: number): BenchSound {
		const { audio } = atPresetRate(s.audio);
		// a generated sound is what its voice is (on its own key, TE's name for that key)
		const voiced = s.voice ? VOICE_KIND[s.voice.type] : null;
		const guess = voiced ? null : classifyDrum(s.name, audio);
		const kind =
			voiced && slot >= 0 && sameFamily(voiced, TE_LAYOUT[slot])
				? TE_LAYOUT[slot]
				: (voiced ?? guess?.kind ?? 'perc');
		// a generated kit's sounds are named after it ("909 kick"): the key shows the sound alone
		const name = s.voice ? s.name.replace(/^(808|909|lo-fi|tight|boom|rnd)\s+/, '') : s.name;
		return makeSound(name, audio, 'drum', {
			kind,
			kindFrom: s.voice ? 'generated' : (guess?.from ?? 'name'),
			reason: s.voice ? `a generated ${s.voice.type}` : (guess?.reason ?? ''),
			voice: s.voice ?? null,
			pitch: s.voice?.pitch ?? null
		});
	}

	/** A SoundFont dropped here, and which of its presets is on the keys. */
	soundFont = $state.raw<SoundFont | null>(null);
	soundFontPreset = $state(0);

	/** Puts one of a SoundFont's presets on the keys: a multisample, or a kit for a drum preset. */
	openSoundFont(font: SoundFont, index: number): void {
		const imported = soundFontSamples(font, index);
		this.openPreset({
			kind: imported.kind,
			name: safeName(imported.name, 24),
			samples: imported.samples,
			patch: {},
			warnings: imported.warnings
		});
		this.soundFont = font;
		this.soundFontPreset = index;
		const zones = imported.kind === 'drum' ? 'keys' : 'zones';
		this.say(
			`${imported.name}: ${this.sounds.length} ${zones} from ${font.name || 'the soundfont'}`
		);
	}

	/** Opens an existing preset to edit it again: its kind, name, sounds and their edits. */
	openPreset(preset: ImportedPreset): void {
		this.#save('open', false);
		this.soundFont = null;
		const sound = (s: SampleInput, kind: PresetKind, extra: Partial<BenchSound> = {}) => {
			const { audio } = atPresetRate(s.audio);
			const scale = PRESET_RATE / s.audio.sampleRate;
			const at = (f: number) => Math.round(f * scale);
			const e = s.edit;
			const edit = e
				? clampEdit(
						{
							...e,
							start: at(e.start),
							end: at(e.end),
							fadeIn: at(e.fadeIn),
							fadeOut: at(e.fadeOut),
							loop: {
								...e.loop,
								start: at(e.loop.start),
								end: at(e.loop.end),
								crossfade: at(e.loop.crossfade)
							}
						},
						audio.channels[0].length
					)
				: defaultEdit(audio, kind);
			return makeSound(stem(s.name), audio, kind, { ...extra, edit });
		};
		this.mode = preset.kind;
		this.name = preset.name;
		this.source = '';
		if (preset.kind === 'drum') {
			const kit = emptyKeys();
			for (const s of preset.samples) {
				const at = (s.key ?? 0) - DRUM_FIRST_KEY;
				if (at < 0 || at >= KEYS || kit[at]) continue;
				const guess = classifyDrum(s.name, s.audio);
				kit[at] = sound(s, 'drum', {
					kind: guess.kind,
					kindFrom: guess.from,
					reason: guess.reason
				});
			}
			this.kit = kit;
		} else if (preset.kind === 'multisampler') {
			this.zones = preset.samples
				.map((s) => sound(s, 'multisampler', { root: s.root ?? 60, rootFrom: 'file' }))
				.sort((a, b) => (a.root ?? 0) - (b.root ?? 0));
		} else {
			const [first] = preset.samples;
			this.one = first
				? sound(first, 'sampler', { root: first.root ?? 60, rootFrom: 'file' })
				: null;
		}
		this.selected = this.sounds[0]?.id ?? null;
		this.key = null;
		const said = preset.warnings.length > 0 ? `: ${preset.warnings[0]}` : '';
		this.say(`${preset.name}.preset opened, ${this.sounds.length} sounds${said}`);
	}

	/** A generated kit in a style on every key. */
	generate(style: KitStyle, seed = 1): void {
		this.useKit(`${style} kit`, generateKit(style, seed));
		this.say(`a ${style} kit, made from numbers: turn its voices on the voice page`);
	}

	/** A kit nobody has heard before. */
	randomize(): void {
		const seed = Math.floor(Math.random() * 1e6) + 1;
		this.useKit(`rnd ${seed % 1000}`, randomKit(seed));
		this.say('a random kit: mutate it, or roll again');
	}

	/** Nudges every generated voice (or only the one being edited). */
	mutate(onlyCurrent = false): void {
		this.#save('mutate', false);
		const seed = Math.floor(Math.random() * 1e6) + 1;
		let count = 0;
		this.kit = this.kit.map((s, i) => {
			if (!s?.voice || (onlyCurrent && s.id !== this.selected)) return s;
			count++;
			return this.#revoice(s, mutateVoice(s.voice, 0.18, seed + i));
		});
		this.say(
			count > 0 ? `${count} voices mutated` : 'only generated sounds mutate: make a kit first'
		);
	}

	/** Turns one number of a generated voice, and renders it again. */
	setVoice(id: number, param: VoiceParam, value: number): void {
		this.#save(`voice ${id} ${param}`);
		this.kit = this.kit.map((s) =>
			s?.id === id && s.voice ? this.#revoice(s, { ...s.voice, [param]: value }) : s
		);
	}

	#revoice(s: BenchSound, voice: Voice): BenchSound {
		const audio = renderVoice(voice);
		const fresh = defaultEdit(audio, 'drum');
		const { gain, pan, transpose, reverse, playmode } = s.edit;
		return {
			...s,
			audio,
			peaks: overview(audio, 64),
			voice,
			pitch: voice.pitch ?? s.pitch,
			edit: clampEdit(
				{ ...fresh, gain, pan, transpose, reverse, playmode },
				audio.channels[0].length
			)
		};
	}

	/** The samples as the builder takes them. */
	samples(): SampleInput[] {
		switch (this.mode) {
			case 'drum':
			case 'slices':
				return this.keys.flatMap((s, i) =>
					s ? [{ name: s.name, audio: s.audio, key: DRUM_FIRST_KEY + i, edit: s.edit }] : []
				);
			case 'multisampler':
				return this.zones.slice(0, MAX_ZONES).map((s) => ({
					name: s.name,
					audio: s.audio,
					root: s.root ?? 60,
					edit: s.edit
				}));
			case 'sampler':
				return this.one
					? [
							{
								name: this.one.name,
								audio: this.one.audio,
								root: this.one.root ?? 60,
								edit: this.one.edit
							}
						]
					: [];
		}
	}

	/** Writes the preset (null when there is nothing to write or an error stands). */
	build(): BuiltPreset | null {
		if (this.problems.some((p) => p.level === 'error')) return null;
		const built = buildPreset(this.samples(), {
			kind: this.kind,
			name: this.presetName || 'untitled',
			normalize: this.normalize,
			crop: true
		});
		return built.patch.regions.length > 0 ? built : null;
	}

	/** The kit as drum sounds with their edits written in, for the replica's drum sampler. */
	kitForReplica(): { key: number; name: string; audio: PcmAudio }[] {
		return this.keys.flatMap((s, i) => {
			if (!s) return [];
			const gain = 10 ** (s.edit.gain / 20);
			const channels = s.audio.channels.map((c) => {
				const out = c.slice(s.edit.start, s.edit.end);
				for (let j = 0; j < s.edit.fadeIn; j++) out[j] *= j / s.edit.fadeIn;
				for (let j = 0; j < s.edit.fadeOut; j++) out[out.length - 1 - j] *= j / s.edit.fadeOut;
				if (s.edit.reverse) out.reverse();
				for (let j = 0; j < out.length; j++) out[j] *= gain;
				return out;
			});
			return [
				{
					key: DRUM_FIRST_KEY + i,
					name: s.kind ?? s.name,
					audio: { sampleRate: PRESET_RATE, channels }
				}
			];
		});
	}
}
