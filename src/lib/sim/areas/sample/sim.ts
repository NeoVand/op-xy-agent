/**
 * The sample key and the sampler engines: recording, the one-shot sampler, drum sampler and
 * multisampler editing, slicing (transient, even, tap) and the sample library browser (guide art
 * sample-003 … 140). The area owns the screen while the sample overlay is open (the record page,
 * the library or the slicer) and claims the gestures that start anywhere: the sample key, the
 * keyboard octave, key + M1…M4 on the drum sampler and shift + click E3 on the other samplers.
 * The sampler tracks' M1 pages stay the core's drum page, built by `m1.ts`.
 *
 * Behaviour follows our manual (unit ids in comments); where it is silent the choice is marked
 * "ours".
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import { clamp, type SimState } from '../../params';
import type { AreaContext, LedMap, SimArea } from '../types';
import type {
	KeyboardView,
	LibraryColumn,
	SampleLibraryFrame,
	SampleRecordFrame,
	SampleSliceFrame
} from './frames';
import { browse, entryName, type LibraryNode } from './library';
import { nextLoopType, zoneOf } from './m1';
import {
	advanceRecord,
	arm,
	capture,
	disarm,
	finish,
	keyNote,
	playTake,
	recordedMs,
	recordingStart,
	targetOf,
	timerText
} from './record';
import {
	SLICE_COLUMN,
	advanceSlicer,
	applySlices,
	sliceCount,
	sliceMarkers,
	sliceWave,
	slices,
	startPlay,
	tap
} from './slicer';
import {
	CHANNELS,
	KEYS,
	MAX_SECONDS,
	SLICE_MODES,
	SOURCES,
	defaultRegion,
	placeZone,
	type SampleFile,
	type SamplePage,
	type SlicerState
} from './state';
import { wave } from './wave';

/** Columns of the record page's card: 2.07 px each over its 355 px. */
export const CARD_COLUMNS = 171;
/** Columns of the library's waveform tile (75 px). */
export const TILE_COLUMNS = 36;
/** Rows of a library column. */
export const LIBRARY_ROWS = 8;

const KEYBOARD = KEYBOARD_NOTE_NAMES as readonly string[];

/** Index (0–23) of a keyboard key control, or −1. */
function keyIndex(id: string): number {
	return id.startsWith('keyboard.') ? KEYBOARD.indexOf(id.slice('keyboard.'.length)) : -1;
}

/** The keyboard key held down now (the first one), or −1. */
function heldKey(s: SimState): number {
	for (const id of s.held) {
		const k = keyIndex(id);
		if (k >= 0) return k;
	}
	return -1;
}

/** "+11", "0", "–6": the gain as the page shows it (en dash like the tune). */
export function formatGain(db: number): string {
	const v = Math.round(db);
	if (v === 0) return '0';
	return `${v < 0 ? '–' : '+'}${Math.abs(v)}`;
}

/**
 * The instrument M1 page of a track running one of `engines` is showing, nothing over it (the
 * system area's pages, such as the preset browser, open without an overlay: their soft keys stay
 * theirs while a note is held).
 */
function onM1(s: SimState, engines: readonly string[]): boolean {
	return (
		s.mode === 'instrument' &&
		s.overlay === null &&
		s.sub === null &&
		s.picker === null &&
		s.areas.system.page === null &&
		s.pages.instrument === 1 &&
		engines.includes(s.tracks[s.track].engine)
	);
}

/**
 * Whether − and + move the keyboard's octave now (manual: hardware/layout "octave-keys": other
 * pages give them other jobs): on the instrument pages and the sample pages, alone.
 */
function octaveKeys(s: SimState): boolean {
	return (
		s.mode === 'instrument' &&
		(s.overlay === null || s.overlay === 'sample') &&
		s.sub === null &&
		!s.shift &&
		!s.held.some((id) => id.startsWith('step.') || id.startsWith('keyboard.'))
	);
}

/** Opens one of the area's pages over whatever the screen showed. */
function openPage(s: SimState, page: SamplePage): void {
	s.overlay = 'sample';
	s.sub = null;
	s.picker = null;
	s.areas.sample.page = page;
}

/** Leaves the area: back to the mode's page; an armed recorder keeps nothing. */
function close(s: SimState): void {
	const area = s.areas.sample;
	disarm(area.record);
	area.record.playing = false;
	area.library.previewing = false;
	area.slicer = null;
	area.page = 'record';
	s.overlay = null;
}

/**
 * The sample key (manual: sampler/sampling, sample-library): shift + sample, or a held keyboard
 * key + sample, opens the library (for that key); sample opens the record page for the track's
 * engine; pressed again on the record page it closes it (ours, like the other module keys).
 */
function sampleKey(s: SimState): void {
	const area = s.areas.sample;
	const key = heldKey(s);
	if (key >= 0 || s.shift) {
		if (key >= 0 && targetOf(s) !== 'library') s.tracks[s.track].drumKey = key;
		area.library.previewing = false;
		openPage(s, 'library');
		return;
	}
	if (s.overlay === 'sample' && s.sub === null && area.page === 'record') {
		close(s);
		return;
	}
	area.slicer = null;
	openPage(s, 'record');
}

// ─────────────────────────────────────────────────────────────── keys on sampler tracks

/** Keyboard keys that hold a sample: drum keys, or the keys zones end on at this octave. */
function filledKeys(s: SimState): number[] {
	const area = s.areas.sample;
	const st = area.tracks[s.track];
	const t = s.tracks[s.track];
	if (t.engine === 'multisampler') {
		const low = keyNote(area, 0);
		return st.zones.map((z) => z.note - low).filter((k) => k >= 0 && k < KEYS);
	}
	return st.keys.flatMap((file, k) => (file ? [k] : []));
}

/**
 * M2 / M3 on the record page and in the library: the previous / next key that holds a sample
 * (manual: drum-sampler "step-keys", multisampler "record-keys").
 */
function stepKey(s: SimState, direction: -1 | 1): void {
	const t = s.tracks[s.track];
	const filled = filledKeys(s);
	const next =
		direction < 0 ? filled.filter((k) => k < t.drumKey).pop() : filled.find((k) => k > t.drumKey);
	if (next !== undefined) t.drumKey = next;
}

/**
 * M4: clears the selected key's sample (drum) or the zone it plays (multisampler; the keys below
 * then fall to the next zone up); the file stays in the library (manual: drum-sampler
 * "step-keys", sample-library "key-controls").
 */
function clearKey(s: SimState): void {
	const area = s.areas.sample;
	const t = s.tracks[s.track];
	const st = area.tracks[s.track];
	if (t.engine === 'drum') st.keys[t.drumKey] = null;
	else if (t.engine === 'multisampler') {
		const top = zoneOf(st.zones, keyNote(area, t.drumKey))?.zone.note;
		st.zones = st.zones.filter((z) => z.note !== top);
	}
}

/** Loads a library sample into the track's sampler (manual: sample-library "enter"). */
function load(s: SimState, file: SampleFile): boolean {
	const area = s.areas.sample;
	const t = s.tracks[s.track];
	const st = area.tracks[s.track];
	switch (targetOf(s)) {
		case 'drum': {
			st.keys[t.drumKey] = { ...file };
			const k = t.drumKeys[t.drumKey];
			k.start = 0;
			k.end = 99;
			return true;
		}
		case 'sampler':
			st.synth = { file: { ...file }, root: file.root ?? 60, region: defaultRegion() };
			return true;
		case 'multisampler': {
			const note = keyNote(area, t.drumKey);
			st.zones = placeZone(st.zones, {
				note,
				file: { ...file, root: note },
				region: defaultRegion()
			});
			return true;
		}
		default:
			// other engines have no sampler to load into: the library only previews (ours)
			return false;
	}
}

/**
 * Key + M1…M4 on the drum sampler's M1 page (manual: slicing "open", drum-sampler "copy-paste",
 * "multi-select"): slice the held key, copy it, paste onto it, or add it to (remove it from) the
 * keys edited together.
 */
function keyCombo(s: SimState, key: number, m: number): void {
	const area = s.areas.sample;
	const t = s.tracks[s.track];
	const st = area.tracks[s.track];
	switch (m) {
		case 1:
			if (!st.keys[key]) return;
			area.slicer = {
				key,
				mode: 'transient',
				counts: { transient: 8, even: 8 },
				section: { start: 0, end: 1 },
				taps: [],
				extended: false,
				edits: [],
				selected: null,
				play: null
			};
			openPage(s, 'slicer');
			return;
		case 2:
			area.clipboard = {
				file: st.keys[key] ? { ...(st.keys[key] as SampleFile) } : null,
				settings: { ...t.drumKeys[key] }
			};
			return;
		case 3:
			if (!area.clipboard) return;
			st.keys[key] = area.clipboard.file ? { ...area.clipboard.file } : null;
			t.drumKeys[key] = { ...area.clipboard.settings };
			return;
		case 4:
			st.selection = st.selection.includes(key)
				? st.selection.filter((k) => k !== key)
				: [...st.selection, key].sort((a, b) => a - b);
			return;
	}
}

// ─────────────────────────────────────────────────────────────── the record page

/** The multisampler's keyboard on the record page. */
function keyboardView(s: SimState): KeyboardView {
	const area = s.areas.sample;
	const st = area.tracks[s.track];
	const low = keyNote(area, 0);
	const selected = keyNote(area, s.tracks[s.track].drumKey);
	const found = zoneOf(st.zones, selected);
	return {
		low,
		high: low + KEYS - 1,
		selected,
		tops: st.zones.map((z) => z.note),
		zone: found ? { lo: found.lo, hi: found.hi } : null
	};
}

/** The sample the record page's card shows, and whether it is the key's own (white). */
function cardSample(s: SimState): { file: SampleFile | null; tone: 'white' | 'light' } {
	const area = s.areas.sample;
	const t = s.tracks[s.track];
	const st = area.tracks[s.track];
	switch (targetOf(s)) {
		case 'library':
			return { file: area.record.take, tone: 'white' };
		case 'sampler':
			// the sample a new take replaces: grey, as TE's "press key to sample" page
			return { file: st.synth.file, tone: 'light' };
		case 'drum':
			return { file: st.keys[t.drumKey], tone: 'white' };
		case 'multisampler':
			return { file: zoneOf(st.zones, keyNote(area, t.drumKey))?.zone.file ?? null, tone: 'white' };
	}
}

/** The record page (manual: sampler/sampling; art sample-003, 004, 017, 100). */
export function recordFrame(s: SimState): SampleRecordFrame {
	const area = s.areas.sample;
	const rec = area.record;
	const target = targetOf(s);
	const start = recordingStart(rec);
	const recording = start !== null;
	const armed = rec.trigger !== null && !recording;
	const ms = recordedMs(rec);
	const { file, tone } = cardSample(s);
	let card: string;
	if (recording) {
		// the take grows over the 20 s the page can hold
		const peaks = capture(start, Math.max(ms, 1), rec.gain);
		card = wave({ seconds: Math.max(ms, 1) / 1000, seed: 0, peaks }, 0, MAX_SECONDS, CARD_COLUMNS);
	} else if (file) card = wave(file, 0, file.seconds, CARD_COLUMNS);
	else card = '0'.repeat(CARD_COLUMNS);
	const channels = CHANNELS[rec.source];
	const keyed = target === 'drum' || target === 'multisampler';
	return {
		page: 'sample-record',
		target,
		header: recording || armed || keyed ? 'timer' : 'prompt',
		timer: timerText(recording ? ms : 0),
		armed,
		recording,
		name: recording ? null : (file?.name ?? null),
		nameTone: tone,
		wave: card,
		source: rec.source,
		gain: formatGain(rec.gain),
		// shift + E1 picks the input channel of line in and USB (manual: sampling "parameters")
		channel: s.shift && channels.length > 0 ? channels[rec.channel] : null,
		level: clamp(rec.level, 0, 1),
		threshold: rec.threshold / 99,
		// the synth sampler's page labels no keys (sample-003): a key press starts it
		soft:
			target === 'library'
				? { record: true, play: rec.take !== null, arrows: false, clear: rec.take !== null }
				: keyed
					? { record: true, play: null, arrows: true, clear: file !== null }
					: { record: false, play: null, arrows: false, clear: null },
		keyboard: target === 'multisampler' ? keyboardView(s) : null
	};
}

/** Keys on the record page. */
function pressRecord(ctx: AreaContext, id: string): boolean {
	const s = ctx.state;
	const area = s.areas.sample;
	const rec = area.record;
	const t = s.tracks[s.track];
	const target = targetOf(s);
	const keyed = target === 'drum' || target === 'multisampler';
	const m = /^key\.m([1-4])$/.exec(id);
	if (m) {
		switch (Number(m[1])) {
			case 1:
				// hold M1 to record; it starts once the input passes the threshold (manual: sampling)
				if (!rec.trigger) arm(rec, id, ctx.now(), keyed ? t.drumKey : -1);
				break;
			case 2:
				if (target === 'library') playTake(rec);
				else if (keyed) stepKey(s, -1);
				break;
			case 3:
				if (keyed) stepKey(s, 1);
				break;
			case 4:
				if (target === 'library' && rec.take) {
					// M4 deletes the take before it reaches the library (manual: sampling "keep-or-bin")
					const id = rec.take.id;
					area.user = area.user.filter((f) => f.id !== id);
					rec.take = null;
					rec.playing = false;
				} else if (keyed) clearKey(s);
				break;
		}
		return true;
	}
	const k = keyIndex(id);
	if (k < 0) return false;
	if (target === 'sampler') {
		// a key starts sampling and becomes the note the sample is tuned to (manual: synth-sampler)
		if (!rec.trigger) arm(rec, id, ctx.now(), k);
		return true;
	}
	if (keyed) {
		// a key selects where the take goes; it lights up (manual: drum-sampler "record")
		t.drumKey = k;
		return true;
	}
	return false;
}

/** Encoders on the record page (manual: sampling "parameters"). */
function turnRecord(s: SimState, e: number, delta: number): void {
	const rec = s.areas.sample.record;
	if (e === 0) {
		if (s.shift) {
			const channels = CHANNELS[rec.source];
			if (channels.length > 0) rec.channel = clamp(rec.channel + delta, 0, channels.length - 1);
			return;
		}
		const at = SOURCES.indexOf(rec.source);
		const next = SOURCES[clamp(at + delta, 0, SOURCES.length - 1)];
		if (next !== rec.source) {
			rec.source = next;
			rec.channel = 0;
		}
	} else if (e === 2) rec.gain = clamp(rec.gain + delta, -24, 24);
	else if (e === 3) rec.threshold = clamp(rec.threshold + delta, 0, 99);
}

// ─────────────────────────────────────────────────────────────── the slicer

/** The slicer page (manual: sampler/slicing; art sample-076, 080, 087, 094). */
export function sliceFrame(s: SimState, slicer: SlicerState): SampleSliceFrame {
	return {
		page: 'sample-slice',
		mode: slicer.mode,
		count: String(sliceCount(s, slicer)),
		wave: sliceWave(s, slicer),
		markers: sliceMarkers(s, slicer),
		playhead: slicer.play ? Math.round(slicer.play.position * 10000) / 10000 : null
	};
}

/** A step of a slice edge: one slicer column, a tenth of it when pushed. */
const edgeStep = (fine: boolean) => (SLICE_COLUMN / 480) * (fine ? 0.1 : 1);

/** Encoders on the slicer (manual: slicing "modes", "transient", "even", "tap-edit"). */
function turnSlicer(
	s: SimState,
	slicer: SlicerState,
	e: number,
	delta: number,
	fine: boolean
): void {
	if (e === 0) {
		const at = SLICE_MODES.indexOf(slicer.mode);
		slicer.mode = SLICE_MODES[clamp(at + delta, 0, SLICE_MODES.length - 1)];
		slicer.selected = null;
		return;
	}
	const by = delta * edgeStep(fine);
	const round = (v: number) => Math.round(v * 10000) / 10000;
	switch (slicer.mode) {
		case 'transient': {
			if (e === 3) {
				slicer.counts.transient = clamp(slicer.counts.transient + delta, 1, KEYS);
				slicer.edits = [];
				slicer.selected = null;
				return;
			}
			const i = slicer.selected;
			const slice = i === null ? undefined : slices(s, slicer)[i];
			if (i === null || !slice) return;
			const edit = { index: i, start: slice.start, end: slice.end };
			if (e === 1) edit.start = round(clamp(slice.start + by, 0, slice.end - 0.001));
			else edit.end = round(clamp(slice.end + by, slice.start + 0.001, 1));
			slicer.edits = [...slicer.edits.filter((x) => x.index !== i), edit];
			return;
		}
		case 'even': {
			const sec = slicer.section;
			const step = delta * (fine ? 0.001 : 0.01);
			if (e === 1) sec.start = round(clamp(sec.start + step, 0, sec.end - 0.01));
			else if (e === 2) sec.end = round(clamp(sec.end + step, sec.start + 0.01, 1));
			else slicer.counts.even = clamp(slicer.counts.even + delta, 1, KEYS);
			return;
		}
		case 'tap': {
			// E2 moves the selected slice's start, which is also the previous slice's end
			const i = slicer.selected;
			if (e !== 1 || i === null || i >= slicer.taps.length) return;
			const taps = [...slicer.taps];
			const lo = i > 0 ? taps[i - 1] + 0.001 : 0;
			const hi = i + 1 < taps.length ? taps[i + 1] - 0.001 : 1;
			taps[i] = round(clamp(taps[i] + by, lo, hi));
			slicer.taps = taps;
			return;
		}
	}
}

/** Keys on the slicer. */
function pressSlicer(ctx: AreaContext, slicer: SlicerState, id: string): boolean {
	const s = ctx.state;
	const now = ctx.now();
	if (/^track\.[1-8]$/.test(id)) {
		// the slicer belongs to the track: another track key leaves it (ours)
		close(s);
		return false;
	}
	const m = /^key\.m([1-4])$/.exec(id);
	if (m) {
		switch (Number(m[1])) {
			case 1:
				// tap mode: start the sample, then mark slices as it plays; elsewhere: play it (ours)
				if (slicer.mode === 'tap') tap(s, slicer, now);
				else startPlay(slicer, 0, 1, now);
				break;
			case 2:
				// M2 stops; in tap mode the last slice then runs to the end (manual: slicing "tap")
				if (slicer.mode === 'tap' && slicer.play && slicer.taps.length > 0) slicer.extended = true;
				slicer.play = null;
				break;
			case 3:
				close(s);
				break;
			case 4:
				applySlices(s, slicer);
				close(s);
				break;
		}
		return true;
	}
	const k = keyIndex(id);
	if (k < 0) return false;
	if (s.shift && slicer.mode === 'tap') {
		// shift + key deletes that key's slice (manual: slicing "tap-edit")
		if (k < slicer.taps.length) slicer.taps = slicer.taps.filter((_, i) => i !== k);
		slicer.selected = null;
		return true;
	}
	const list = slices(s, slicer);
	if (k < list.length) {
		slicer.selected = k;
		startPlay(slicer, list[k].start, list[k].end, now);
	}
	return true;
}

// ─────────────────────────────────────────────────────────────── the library

/** A column of the library: up to eight rows around the selection, and the scroll thumb. */
function column(items: readonly string[], selected: number | null): LibraryColumn {
	const n = items.length;
	const at = selected ?? 0;
	const offset = clamp(at - Math.floor(LIBRARY_ROWS / 2), 0, Math.max(0, n - LIBRARY_ROWS));
	return {
		items: items.slice(offset, offset + LIBRARY_ROWS),
		selected: selected === null ? null : selected - offset,
		thumb: {
			top: n > 0 ? offset / n : 0,
			size: n > 0 ? Math.min(1, LIBRARY_ROWS / n) : 1
		}
	};
}

/** The library page (manual: sampler/sample-library; art sample-132, 140). */
export function libraryFrame(s: SimState): SampleLibraryFrame {
	const area = s.areas.sample;
	const { siblings, open, entries } = browse(area);
	const folders = siblings.filter((n) => n.kind === 'folder');
	const item = clamp(area.library.item, 0, Math.max(0, entries.length - 1));
	const selected = entries[item];
	const target = targetOf(s);
	return {
		page: 'sample-library',
		folders: column(
			folders.map((n) => (n.kind === 'folder' ? n.name : '')),
			folders.length > 0 ? clamp(open, 0, folders.length - 1) : null
		),
		files: column(entries.map(entryName), entries.length > 0 ? item : null),
		tile:
			selected && selected.kind === 'file'
				? wave(selected.file, 0, selected.file.seconds, TILE_COLUMNS)
				: null,
		keyControls: target === 'drum' || target === 'multisampler'
	};
}

/** The folder entries of the open folder's parent (what E1 moves over). */
function siblingFolders(s: SimState): LibraryNode[] {
	return browse(s.areas.sample).siblings.filter((n) => n.kind === 'folder');
}

/** Encoders in the library: E1 the folder, E2–E4 the sample (manual: sample-library). */
function turnLibrary(s: SimState, e: number, delta: number): void {
	const lib = s.areas.sample.library;
	if (e === 0) {
		const n = siblingFolders(s).length;
		const path = lib.path.length > 0 ? [...lib.path] : [0];
		path[path.length - 1] = clamp(path[path.length - 1] + delta, 0, Math.max(0, n - 1));
		lib.path = path;
		lib.item = 0;
		lib.previewing = false;
		return;
	}
	const entries = browse(s.areas.sample).entries;
	lib.item = clamp(lib.item + delta, 0, Math.max(0, entries.length - 1));
	// a sample plays as soon as it is selected (manual: sample-library "preview"), unless the system
	// setting for it (OS 1.1.17, manual: "preview-setting") is off
	lib.previewing = entries[lib.item]?.kind === 'file' && s.areas.system.system.preview;
}

/** A click in the library: enter a sub-folder, or load the sample (manual: sample-library). */
function clickLibrary(s: SimState): void {
	const lib = s.areas.sample.library;
	const entries = browse(s.areas.sample).entries;
	const node = entries[lib.item];
	if (!node) return;
	if (node.kind === 'folder') {
		const index = entries.filter((n) => n.kind === 'folder').indexOf(node);
		lib.path = [...lib.path, index];
		lib.item = 0;
		lib.previewing = false;
		return;
	}
	if (load(s, node.file)) lib.previewing = false;
}

/** Keys in the library. */
function pressLibrary(ctx: AreaContext, id: string): boolean {
	const s = ctx.state;
	const lib = s.areas.sample.library;
	const target = targetOf(s);
	const keyed = target === 'drum' || target === 'multisampler';
	const m = /^key\.m([1-4])$/.exec(id);
	if (m) {
		const n = Number(m[1]);
		if (n === 1 && lib.path.length > 1) {
			// M1 goes back up out of a sub-folder (ours: the guide does not say how)
			const path = [...lib.path];
			const index = path.pop() as number;
			lib.path = path;
			const entries = browse(s.areas.sample).entries;
			const folder = entries.filter((e) => e.kind === 'folder')[index];
			lib.item = Math.max(0, entries.indexOf(folder as LibraryNode));
		} else if (keyed && n === 2) stepKey(s, -1);
		else if (keyed && n === 3) stepKey(s, 1);
		else if (keyed && n === 4) clearKey(s);
		return true;
	}
	if (id === 'key.stop') {
		// stop ends the preview (manual: sample-library); the transport stops too
		lib.previewing = false;
		return false;
	}
	const k = keyIndex(id);
	if (k >= 0 && target !== 'library') {
		// the key the library loads into (manual: sample-library "from-key")
		s.tracks[s.track].drumKey = k;
		return true;
	}
	return false;
}

// ─────────────────────────────────────────────────────────────── the area

/** The sample area. */
export const sample: SimArea = {
	id: 'sample',
	owns: (s) => s.overlay === 'sample',

	frame(s) {
		const area = s.areas.sample;
		if (area.page === 'library') return libraryFrame(s);
		if (area.page === 'slicer' && area.slicer) return sliceFrame(s, area.slicer);
		return recordFrame(s);
	},

	claim(ctx, input) {
		const s = ctx.state;
		// letting go of what holds the recorder keeps the take, whatever the screen shows now
		if (input.type === 'release' && s.areas.sample.record.trigger === input.id) {
			finish(s, ctx.now());
			return false;
		}
		if (input.type === 'press') {
			if (input.id === 'key.sample') {
				sampleKey(s);
				return true;
			}
			if ((input.id === 'key.minus' || input.id === 'key.plus') && octaveKeys(s)) {
				// the keyboard's octave, which sampler notes and zones depend on; not consumed
				const area = s.areas.sample;
				area.octave = clamp(area.octave + (input.id === 'key.plus' ? 1 : -1), -4, 4);
				return false;
			}
			const m = /^key\.m([1-4])$/.exec(input.id);
			const key = heldKey(s);
			if (m && key >= 0 && onM1(s, ['drum'])) {
				keyCombo(s, key, Number(m[1]));
				return true;
			}
		}
		// shift + click E3: loop type (manual: synth-sampler, multisampler "editing")
		if (input.type === 'click' && input.id === 'encoder.3' && s.shift) {
			if (onM1(s, ['sampler', 'multisampler'])) return nextLoopType(s);
		}
		return false;
	},

	press(ctx, id) {
		const s = ctx.state;
		const area = s.areas.sample;
		const active = s.active === 'instrument' ? s.track : s.auxTrack;
		if (id === `track.${active + 1}` && area.page !== 'slicer') {
			// the lit track key leaves the page (manual: sampling "exit")
			close(s);
			return true;
		}
		if (area.page === 'library') return pressLibrary(ctx, id);
		if (area.page === 'slicer' && area.slicer) return pressSlicer(ctx, area.slicer, id);
		return pressRecord(ctx, id);
	},

	turn(ctx, encoder, delta, fine) {
		const s = ctx.state;
		const area = s.areas.sample;
		if (area.page === 'library') turnLibrary(s, encoder, delta);
		else if (area.page === 'slicer' && area.slicer)
			turnSlicer(s, area.slicer, encoder, delta, fine);
		else turnRecord(s, encoder, delta);
	},

	click(ctx) {
		if (ctx.state.areas.sample.page === 'library') clickLibrary(ctx.state);
	},

	leds(s, leds: LedMap) {
		const area = s.areas.sample;
		const t = s.tracks[s.track];
		const light = (k: number, state: 'white' | 'dim') => {
			const name = KEYBOARD[k];
			if (name) leds[`keyboard.${name}` as KeyId] = state;
		};
		if (area.page === 'slicer' && area.slicer) {
			slices(s, area.slicer).forEach((_, k) => {
				if (leds[`keyboard.${KEYBOARD[k]}` as KeyId] !== 'white') light(k, 'dim');
			});
			if (area.slicer.selected !== null) light(area.slicer.selected, 'white');
			return;
		}
		const target = targetOf(s);
		if (target !== 'drum' && target !== 'multisampler') return;
		// keys holding a sample glow; the selected one is lit (manual: drum-sampler "record")
		if (area.page === 'record') {
			for (const k of filledKeys(s)) {
				if (leds[`keyboard.${KEYBOARD[k]}` as KeyId] !== 'white') light(k, 'dim');
			}
		}
		light(t.drumKey, 'white');
	},

	advance(s, ms) {
		const area = s.areas.sample;
		if (area.record.trigger || (s.overlay === 'sample' && area.page === 'record')) {
			advanceRecord(s, ms);
		}
		if (area.slicer) advanceSlicer(s, area.slicer, ms);
	}
};
