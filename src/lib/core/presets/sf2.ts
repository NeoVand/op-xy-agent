// Zone mapping ported from charlesvestal/sf2-to-opxy (MIT) src/sf2_to_opxy/sf2_reader.py, selection.py and converter.py; the RIFF parser is our own, from the SoundFont 2.01 specification.

/**
 * SoundFont 2 (`.sf2`) in for OP-XY presets: a preset becomes a multisampler (one sample per root,
 * at most 24 spread over its range, from the layer played at velocity 100) or a drum kit (one sound
 * per key, on keys 53–76), each sample with the loop, tuning and level the SoundFont gives it, ready
 * for `buildPreset` (docs/research/30-presets-samples.md §2.6–2.7).
 *
 * The file is read as the SoundFont 2.01 specification lays it out: `INFO`'s name, the 16-bit
 * `smpl` points (with the 24-bit `sm24` low bytes of 2.04 files) and the `pdta` hydra. Generators
 * resolve as its §8.5 has it: an instrument zone's over its instrument's global zone, a preset
 * zone's (or its preset's global zone's) added on top, key and velocity ranges intersected, and
 * the instrument-only ones (sample offsets, loop mode, exclusive class, root key) ignored in a
 * preset. Not carried over: modulators, envelopes, filters, LFOs, effect sends, `keynum` and
 * `velocity`. Compressed SoundFonts (sf3) are refused; ROM samples, which the file does not hold,
 * are left out.
 */
import { noteName } from './audio';
import type { SampleInput } from './build';
import {
	EDIT_RANGES,
	MIN_SPAN,
	clampEdit,
	defaultEdit,
	type LoopEdit,
	type SoundEdit
} from './edit';
import { DRUM_FIRST_KEY, DRUM_KEYS, MAX_ZONES, type LoopMode } from './patch';
import type { PcmAudio } from './wav';

/** Thrown for bytes that are not a SoundFont 2 file, or one that is truncated, corrupt or sf3. */
export class Sf2Error extends Error {
	override name = 'Sf2Error';
}

/** A preset of the SoundFont, as the picker lists it. */
export interface SoundFontPreset {
	/** Its place in the file's preset list (`phdr`, without the terminal record). */
	readonly index: number;
	readonly name: string;
	/** The MIDI bank: General MIDI's kits are in 128. */
	readonly bank: number;
	/** The MIDI program (0–127). */
	readonly program: number;
	/** Instrument zones it plays: those whose key and velocity ranges meet the preset zone's. */
	readonly zones: number;
	/**
	 * It imports as a drum kit: bank 128, a drum word in its or its instruments' names (unless
	 * most zones span several keys, as GM's steel drums do), or most zones on single keys with
	 * many roots (sf2-to-opxy's heuristic, which an instrument sampled on every key passes too).
	 */
	readonly drum: boolean;
}

/** A sample header (`shdr`): where its points lie in `smpl`, its loop, rate and pitch. */
export interface SoundFontSample {
	readonly name: string;
	/** Its first point in `smpl`. */
	readonly start: number;
	/** The point after its last (the first of the 46 zero points that follow each sample). */
	readonly end: number;
	/** The loop's first point. */
	readonly loopStart: number;
	/** The point after the loop's last. */
	readonly loopEnd: number;
	readonly sampleRate: number;
	/** The MIDI key it was recorded at; 255 when it has no pitch. */
	readonly originalPitch: number;
	/** Cents it is played off by, to correct its recording. */
	readonly pitchCorrection: number;
	/** The other half of its stereo pair (an index into `samples`). */
	readonly link: number;
	/** 1 mono, 2 a stereo pair's right half, 4 its left, 8 linked; 0x8000 set when in a synth's ROM. */
	readonly type: number;
}

/**
 * A zone a preset plays: one instrument zone under one of the preset's zones, its generators
 * resolved (SoundFont 2.01 §8.5), in the SoundFont's own units.
 */
export interface SoundFontZone {
	/** The preset zone it comes through (its layer), counted from 0 in file order. */
	readonly layer: number;
	/** Its place among the preset's zones, in file order. */
	readonly order: number;
	/** Its instrument's name. */
	readonly instrument: string;
	/** The sample it plays (an index into `samples`). */
	readonly sample: number;
	/** The keys it plays, `keyLo` … `keyHi`: the preset zone's and instrument zone's intersected. */
	readonly keyLo: number;
	readonly keyHi: number;
	/** The velocities it plays, `velLo` … `velHi`, intersected likewise. */
	readonly velLo: number;
	readonly velHi: number;
	/** The key that plays the sample as recorded: `overridingRootKey`, else the sample's pitch. */
	readonly rootKey: number;
	/** Semitones it is tuned by (`coarseTune`). */
	readonly coarseTune: number;
	/** Cents it is tuned by (`fineTune`), the sample's own correction not included. */
	readonly fineTune: number;
	/** Cents from one key to the next (`scaleTuning`): 100 as a keyboard plays, 0 for one pitch. */
	readonly scaleTuning: number;
	/** Centibels it is played down by (`initialAttenuation`). */
	readonly attenuation: number;
	/** −500 (left) … 500 (right), in tenths of a percent (`pan`). */
	readonly pan: number;
	/** `sampleModes`: 0 no loop, 1 loop, 3 loop while held and then play on (2 reads as 0). */
	readonly sampleMode: number;
	/** `exclusiveClass`: a note cuts off the sounding zones of its class (0: none). */
	readonly exclusiveClass: number;
	/** Points added to the sample's start: the fine offset plus 32768 times the coarse one. */
	readonly startOffset: number;
	/** Points added to the sample's end. */
	readonly endOffset: number;
	/** Points added to its loop's start. */
	readonly loopStartOffset: number;
	/** Points added to its loop's end. */
	readonly loopEndOffset: number;
}

/** A parsed SoundFont: its presets for the picker, and what {@link soundFontSamples} reads. */
export interface SoundFont {
	/** The bank's name (`INAM`). */
	readonly name: string;
	/** Sorted by bank, then program. */
	readonly presets: readonly SoundFontPreset[];
	/** The sample headers, without the terminal record. */
	readonly samples: readonly SoundFontSample[];
	/** The zones each preset plays, by the preset's `index`. */
	readonly zones: readonly (readonly SoundFontZone[])[];
	/** The 16-bit sample points (`smpl`): a view of the parsed bytes, not a copy. */
	readonly smpl: Uint8Array;
	/** Each point's low byte when the file is 24-bit (`sm24`), else null. */
	readonly sm24: Uint8Array | null;
}

/** A preset made ready for `buildPreset`, and what did not come across. */
export interface SoundFontImport {
	/** The preset's name as the SoundFont has it (the caller makes it a folder name). */
	readonly name: string;
	readonly kind: 'multisampler' | 'drum';
	/** A multisampler's by root, each with its `root`; a kit's by key, each with its `key`. */
	readonly samples: SampleInput[];
	/** Plain lowercase sentences, e.g. `velocity layers: kept the loudest`. */
	readonly warnings: string[];
}

/** Options for {@link soundFontSamples}. */
export interface SoundFontImportOptions {
	/** Import as this kind instead of what the preset's `drum` guess says. */
	readonly kind?: 'multisampler' | 'drum';
}

/** The generators read, by operator (SoundFont 2.01 §8.1.2). */
const GEN = {
	startAddrsOffset: 0,
	endAddrsOffset: 1,
	startloopAddrsOffset: 2,
	endloopAddrsOffset: 3,
	startAddrsCoarseOffset: 4,
	endAddrsCoarseOffset: 12,
	pan: 17,
	instrument: 41,
	keyRange: 43,
	velRange: 44,
	startloopAddrsCoarseOffset: 45,
	initialAttenuation: 48,
	endloopAddrsCoarseOffset: 50,
	coarseTune: 51,
	fineTune: 52,
	sampleID: 53,
	sampleModes: 54,
	scaleTuning: 56,
	exclusiveClass: 57,
	overridingRootKey: 58
} as const;

/** Sample types: a stereo pair's halves, a sample in a synth's ROM, and sf3's compressed ones. */
const RIGHT = 2;
const LEFT = 4;
const ROM = 0x8000;
const COMPRESSED = 0x10;

/** The velocity whose layer an import keeps: a firm hit. */
const VELOCITY = 100;
/** General MIDI's first kick (35, Acoustic Bass Drum): a kit of more than 24 sounds starts there. */
const GM_KICK = 35;

/** Words that name a kit (sf2-to-opxy's, as whole words, so a "percussive organ" stays an organ). */
const DRUM_WORDS = /\b(drums?|drumkit|kits?|perc|percussion|beats?)\b/i;
/** A stereo half's mark at the end of a sample name ("kick L", "pad(R)"). */
const STEREO_MARK = /(?:[\s_-]+[LR]|\([LR]\))$/;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ascii = (b: Uint8Array, at: number, n: number) =>
	String.fromCharCode(...b.subarray(at, at + n));
/** A generator's 16-bit amount as the signed value most generators hold. */
const signed = (amount: number) => (amount << 16) >> 16;

/** A zero-terminated name in at most `n` bytes (20 for presets, instruments and samples). */
function text(b: Uint8Array, at: number, n: number): string {
	let end = at;
	while (end < at + n && b[end] !== 0) end++;
	return String.fromCharCode(...b.subarray(at, end)).trim();
}

/** A RIFF chunk: its id and where its body lies. */
interface Chunk {
	readonly id: string;
	readonly at: number;
	readonly size: number;
}

/** The chunks from `from` to `to`; one that runs past `to` means the file was cut short. */
function chunks(bytes: Uint8Array, view: DataView, from: number, to: number): Chunk[] {
	const out: Chunk[] = [];
	for (let at = from; at + 8 <= to;) {
		const id = ascii(bytes, at, 4);
		const size = view.getUint32(at + 4, true);
		if (at + 8 + size > to) {
			throw new Sf2Error(`truncated SoundFont: its ${id.trim()} chunk runs past the end`);
		}
		out.push({ id, at: at + 8, size });
		at += 8 + size + (size % 2);
	}
	return out;
}

/** A generator as stored: its operator and 16-bit amount. */
interface Gen {
	readonly oper: number;
	readonly amount: number;
}

/** A preset's or an instrument's zones, unresolved: raw amounts by operator, and what each plays. */
interface Owner {
	readonly name: string;
	readonly global: ReadonlyMap<number, number> | null;
	readonly zones: readonly {
		readonly gens: ReadonlyMap<number, number>;
		readonly target: number;
	}[];
}

/**
 * An owner's zones, bags `first` … `last` − 1. A zone ends at the generator that says what it
 * plays (`terminal`: an instrument, or a sample); any after it are ignored and a generator given
 * twice counts once, the later one (spec §7.5, §7.9). Only the first zone may be global, by having
 * no such generator; any other without one is ignored (§7.3, §7.7).
 */
function owner(
	name: string,
	bags: readonly number[],
	gens: readonly Gen[],
	first: number,
	last: number,
	terminal: number
): Owner {
	if (last < first || last >= bags.length) {
		throw new Sf2Error(`not a valid SoundFont: the zones of "${name}" are out of order`);
	}
	let global: Map<number, number> | null = null;
	const zones: { gens: Map<number, number>; target: number }[] = [];
	for (let b = first; b < last; b++) {
		const from = bags[b];
		const to = bags[b + 1];
		if (to < from || to > gens.length) {
			throw new Sf2Error(`not a valid SoundFont: the generators of "${name}" are out of order`);
		}
		const own = new Map<number, number>();
		let target = -1;
		for (let g = from; g < to && target < 0; g++) {
			if (gens[g].oper === terminal) target = gens[g].amount;
			else own.set(gens[g].oper, gens[g].amount);
		}
		if (target >= 0) zones.push({ gens: own, target });
		else if (b === first) global = own;
	}
	return { name, global, zones };
}

/** The keys (or velocities) two range generators have in common; unset is 0–127. */
function meet(a: number | undefined, b: number | undefined): [number, number] {
	const [aLo, aHi] = a === undefined ? [0, 127] : [a & 0xff, a >> 8];
	const [bLo, bHi] = b === undefined ? [0, 127] : [b & 0xff, b >> 8];
	return [Math.max(aLo, bLo), Math.min(127, aHi, bHi)];
}

/** The zones a preset plays: its zones' instruments' zones, the generators resolved (§8.5). */
function resolve(
	preset: Owner,
	instruments: readonly Owner[],
	samples: readonly SoundFontSample[]
): SoundFontZone[] {
	const out: SoundFontZone[] = [];
	preset.zones.forEach((pz, layer) => {
		const instrument = instruments[pz.target];
		const atPreset = (op: number) => pz.gens.get(op) ?? preset.global?.get(op);
		for (const iz of instrument.zones) {
			const atInstrument = (op: number) => iz.gens.get(op) ?? instrument.global?.get(op);
			// a preset's value adds to its instrument's
			const sum = (op: number, unset: number) =>
				signed(atInstrument(op) ?? unset) + signed(atPreset(op) ?? 0);
			// sample offsets count in the instrument only
			const offset = (fine: number, coarse: number) =>
				signed(atInstrument(fine) ?? 0) + 32768 * signed(atInstrument(coarse) ?? 0);
			const [keyLo, keyHi] = meet(atPreset(GEN.keyRange), atInstrument(GEN.keyRange));
			const [velLo, velHi] = meet(atPreset(GEN.velRange), atInstrument(GEN.velRange));
			if (keyLo > keyHi || velLo > velHi) continue;
			const sample = samples[iz.target];
			const override = signed(atInstrument(GEN.overridingRootKey) ?? 0xffff);
			// 255 marks a sample without pitch: it, and any other value above 127, reads as 60 (§7.10)
			const pitch = sample.originalPitch <= 127 ? sample.originalPitch : 60;
			out.push({
				layer,
				order: out.length,
				instrument: instrument.name,
				sample: iz.target,
				keyLo,
				keyHi,
				velLo,
				velHi,
				rootKey: override >= 0 && override <= 127 ? override : pitch,
				coarseTune: sum(GEN.coarseTune, 0),
				fineTune: sum(GEN.fineTune, 0),
				scaleTuning: sum(GEN.scaleTuning, 100),
				attenuation: sum(GEN.initialAttenuation, 0),
				pan: sum(GEN.pan, 0),
				sampleMode: (atInstrument(GEN.sampleModes) ?? 0) & 3,
				exclusiveClass: atInstrument(GEN.exclusiveClass) ?? 0,
				startOffset: offset(GEN.startAddrsOffset, GEN.startAddrsCoarseOffset),
				endOffset: offset(GEN.endAddrsOffset, GEN.endAddrsCoarseOffset),
				loopStartOffset: offset(GEN.startloopAddrsOffset, GEN.startloopAddrsCoarseOffset),
				loopEndOffset: offset(GEN.endloopAddrsOffset, GEN.endloopAddrsCoarseOffset)
			});
		}
	});
	return out;
}

/** sf2-to-opxy's guess at a kit outside bank 128, from the names and how the zones lie. */
function looksLikeDrums(name: string, zones: readonly SoundFontZone[]): boolean {
	if (zones.length === 0) return false;
	const share = (test: (z: SoundFontZone) => boolean) => zones.filter(test).length / zones.length;
	const named = DRUM_WORDS.test(name) || zones.some((z) => DRUM_WORDS.test(z.instrument));
	// GM's steel drums, taiko and synth drum carry the words but play across the keyboard
	if (named && share((z) => z.keyHi - z.keyLo >= 2) <= 0.5) return true;
	const roots = new Set(zones.map((z) => z.rootKey)).size;
	return share((z) => z.keyLo === z.keyHi) >= 0.7 && roots >= Math.min(8, zones.length);
}

/**
 * Reads a SoundFont 2 file: its presets (with the zones each plays) and its samples, which stay
 * in `bytes` until {@link soundFontSamples} decodes them. Throws {@link Sf2Error} on anything
 * that is not a whole, valid SoundFont 2, and on compressed ones (sf3).
 */
export function parseSoundFont(bytes: Uint8Array): SoundFont {
	if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'sfbk') {
		throw new Sf2Error('not a SoundFont 2 file');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const u16 = (at: number) => view.getUint16(at, true);
	const u32 = (at: number) => view.getUint32(at, true);
	// a RIFF size past the end of the file is let go as long as every chunk inside fits
	const lists = new Map<string, Chunk[]>();
	for (const c of chunks(bytes, view, 12, Math.min(bytes.length, 8 + u32(4)))) {
		if (c.id === 'LIST' && c.size >= 4) {
			lists.set(ascii(bytes, c.at, 4), chunks(bytes, view, c.at + 4, c.at + c.size));
		}
	}
	const info = lists.get('INFO') ?? [];
	const sdta = lists.get('sdta');
	const pdta = lists.get('pdta');
	if (!sdta || !pdta) throw new Sf2Error('not a whole SoundFont: no samples or no presets');
	const ifil = info.find((c) => c.id === 'ifil' && c.size >= 4);
	const [major, minor] = ifil ? [u16(ifil.at), u16(ifil.at + 2)] : [2, 1];
	if (major >= 3) throw new Sf2Error('compressed SoundFonts (sf3) are not supported');
	const inam = info.find((c) => c.id === 'INAM');
	const smplChunk = sdta.find((c) => c.id === 'smpl');
	if (!smplChunk) throw new Sf2Error('this SoundFont holds no samples (no smpl chunk)');
	const points = Math.floor(smplChunk.size / 2);
	const sm24Chunk = sdta.find((c) => c.id === 'sm24');
	// sm24 counts from version 2.04 on, and only with one byte per point (2.04 §6)
	const sm24 =
		sm24Chunk && minor >= 4 && (sm24Chunk.size === points || sm24Chunk.size === points + 1)
			? bytes.subarray(sm24Chunk.at, sm24Chunk.at + points)
			: null;

	const table = (id: string, size: number) => {
		const c = pdta.find((x) => x.id === id);
		if (!c || c.size < size || c.size % size !== 0) {
			throw new Sf2Error(`not a valid SoundFont: its ${id} chunk is missing or cut short`);
		}
		return { at: c.at, count: c.size / size };
	};
	const bags = (id: string) => {
		const t = table(id, 4);
		return Array.from({ length: t.count }, (_, i) => u16(t.at + 4 * i));
	};
	const gens = (id: string): Gen[] => {
		const t = table(id, 4);
		return Array.from({ length: t.count }, (_, i) => ({
			oper: u16(t.at + 4 * i),
			amount: u16(t.at + 4 * i + 2)
		}));
	};

	const shdr = table('shdr', 46);
	const samples: SoundFontSample[] = Array.from({ length: shdr.count - 1 }, (_, i) => {
		const at = shdr.at + 46 * i;
		return {
			name: text(bytes, at, 20),
			start: u32(at + 20),
			end: u32(at + 24),
			loopStart: u32(at + 28),
			loopEnd: u32(at + 32),
			sampleRate: u32(at + 36),
			originalPitch: bytes[at + 40],
			pitchCorrection: view.getInt8(at + 41),
			link: u16(at + 42),
			type: u16(at + 44)
		};
	});
	if (samples.some((s) => (s.type & COMPRESSED) !== 0)) {
		throw new Sf2Error('compressed SoundFonts (sf3) are not supported');
	}

	const inst = table('inst', 22);
	const ibag = bags('ibag');
	const igen = gens('igen');
	const instruments = Array.from({ length: inst.count - 1 }, (_, i) => {
		const at = inst.at + 22 * i;
		const own = owner(text(bytes, at, 20), ibag, igen, u16(at + 20), u16(at + 42), GEN.sampleID);
		if (own.zones.some((z) => z.target >= samples.length)) {
			throw new Sf2Error(`not a valid SoundFont: "${own.name}" plays a sample it does not have`);
		}
		return own;
	});

	const phdr = table('phdr', 38);
	const pbag = bags('pbag');
	const pgen = gens('pgen');
	const presets: SoundFontPreset[] = [];
	const zones: SoundFontZone[][] = [];
	for (let i = 0; i < phdr.count - 1; i++) {
		const at = phdr.at + 38 * i;
		const own = owner(text(bytes, at, 20), pbag, pgen, u16(at + 24), u16(at + 62), GEN.instrument);
		if (own.zones.some((z) => z.target >= instruments.length)) {
			throw new Sf2Error(
				`not a valid SoundFont: "${own.name}" plays an instrument it does not have`
			);
		}
		const played = resolve(own, instruments, samples);
		const bank = u16(at + 22);
		zones.push(played);
		presets.push({
			index: i,
			name: own.name,
			bank,
			program: u16(at + 20),
			zones: played.length,
			drum: bank === 128 || looksLikeDrums(own.name, played)
		});
	}
	presets.sort((a, b) => a.bank - b.bank || a.program - b.program || a.index - b.index);
	return {
		name: inam ? text(bytes, inam.at, Math.min(inam.size, 256)) : '',
		presets,
		samples,
		zones,
		smpl: bytes.subarray(smplChunk.at, smplChunk.at + 2 * points),
		sm24
	};
}

/** A zone whose sample the file holds, and the points of `smpl` it plays (`from` … `to` − 1). */
interface Playable {
	readonly zone: SoundFontZone;
	readonly from: number;
	readonly to: number;
}

/** A zone that sounds in the import: the keys it won, and the other half of its stereo pair. */
interface Choice {
	readonly playable: Playable;
	readonly keys: readonly number[];
	readonly partner: Playable | undefined;
}

/**
 * The points a zone plays, its offsets applied and kept within the sample as players keep them,
 * or null when the file does not hold them (a ROM sample, no rate, nothing left).
 */
function playable(sf: SoundFont, zone: SoundFontZone): Playable | null {
	const s = sf.samples[zone.sample];
	if ((s.type & ROM) !== 0 || s.sampleRate <= 0) return null;
	const lo = Math.min(s.start, sf.smpl.length / 2);
	const hi = clamp(s.end, lo, sf.smpl.length / 2);
	const from = clamp(s.start + zone.startOffset, lo, hi);
	const to = clamp(s.end + zone.endOffset, from, hi);
	return to > from ? { zone, from, to } : null;
}

/** How far a zone's velocities lie from {@link VELOCITY}: 0 over it; a louder layer wins a tie. */
function distance(z: SoundFontZone): number {
	if (z.velLo <= VELOCITY && VELOCITY <= z.velHi) return 0;
	return z.velHi < VELOCITY ? 2 * (VELOCITY - z.velHi) + 1 : 2 * (z.velLo - VELOCITY);
}

/** The other half of a zone's stereo pair: the linked sample's zone in its layer, on its keys. */
function partnerOf(sf: SoundFont, p: Playable, zones: readonly Playable[]): Playable | undefined {
	const z = p.zone;
	const sample = sf.samples[z.sample];
	const other: SoundFontSample | undefined = sf.samples[sample.link];
	const pair =
		(sample.type === LEFT && other?.type === RIGHT) ||
		(sample.type === RIGHT && other?.type === LEFT);
	if (!pair || other.sampleRate !== sample.sampleRate) return undefined;
	return zones.find(
		({ zone: o }) =>
			o.sample === sample.link &&
			o.layer === z.layer &&
			o.keyLo <= z.keyHi &&
			z.keyLo <= o.keyHi &&
			o.velLo <= z.velHi &&
			z.velLo <= o.velHi
	);
}

/**
 * The zones that sound, one on each key as a player sounds it at velocity 100: the layer nearest
 * that velocity (the louder on a tie), then the first of stacked layers, then a stereo pair's left
 * half, whose right half comes along as its partner. What is left out is said in `warnings`.
 */
function choose(sf: SoundFont, zones: readonly Playable[], warnings: Set<string>): Choice[] {
	const ranks = new Map(
		zones.map((p) => {
			const z = p.zone;
			return [p, [distance(z), z.layer, sf.samples[z.sample].type === RIGHT ? 1 : 0, z.order]];
		})
	);
	const ahead = (a: Playable, b: Playable) => {
		const [x, y] = [ranks.get(a) ?? [], ranks.get(b) ?? []];
		const i = x.findIndex((v, j) => v !== y[j]);
		return i >= 0 && x[i] < y[i];
	};
	const winners = Array.from({ length: 128 }, (_, key) => {
		let best: Playable | undefined;
		for (const p of zones) {
			if (p.zone.keyLo <= key && key <= p.zone.keyHi && (!best || ahead(p, best))) best = p;
		}
		return best;
	});
	const won = new Map<Playable, number[]>();
	winners.forEach((p, key) => {
		if (p) won.set(p, [...(won.get(p) ?? []), key]);
	});
	const choices = [...won].map(([p, keys]) => ({
		playable: p,
		keys,
		partner: partnerOf(sf, p, zones)
	}));
	const partners = new Set(choices.map((c) => c.partner));
	let layers = false;
	let stacked = false;
	for (const p of zones) {
		if (won.has(p) || partners.has(p)) continue;
		// left out for a layer nearer velocity 100 on some key, else for an earlier layer
		let quieter = false;
		for (let key = p.zone.keyLo; key <= p.zone.keyHi; key++) {
			const w = winners[key];
			if (w && distance(w.zone) < distance(p.zone)) quieter = true;
		}
		if (quieter) layers = true;
		else stacked = true;
	}
	if (layers) {
		warnings.add(
			choices.every((c) => distance(c.playable.zone) === 0)
				? 'velocity layers: kept the one played at velocity 100'
				: 'velocity layers: kept the loudest'
		);
	}
	if (stacked) warnings.add('layered sounds: kept the first layer on each key');
	return choices;
}

/** A multisample zone with the root (the OP-XY's key center) and cents it is played at. */
interface Tuned extends Choice {
	readonly root: number;
	readonly tune: number;
}

/**
 * `count` of the zones (sorted by root) spread over their range: for evenly spaced targets from
 * the lowest root to the highest, the nearest root not yet taken (sf2-to-opxy's selection.py,
 * which spreads over A0–C8 instead of the zones' own range).
 */
function spread<T extends { readonly root: number }>(sorted: readonly T[], count: number): T[] {
	const lo = sorted[0].root;
	const hi = sorted[sorted.length - 1].root;
	const taken = new Set<number>();
	for (let i = 0; i < count; i++) {
		const target = Math.round(lo + (i * (hi - lo)) / (count - 1));
		let best = -1;
		sorted.forEach((z, j) => {
			if (taken.has(j)) return;
			if (best < 0 || Math.abs(z.root - target) < Math.abs(sorted[best].root - target)) best = j;
		});
		taken.add(best);
	}
	return sorted.filter((_, j) => taken.has(j));
}

/** A multisampler's zones: one per root (the one playing the most keys), at most 24. */
function multisample(sf: SoundFont, zones: readonly Playable[], warnings: Set<string>): Tuned[] {
	const byRoot = new Map<number, Tuned>();
	for (const c of choose(sf, zones, warnings)) {
		const z = c.playable.zone;
		const cents = z.fineTune + sf.samples[z.sample].pitchCorrection;
		const semitones = Math.trunc(cents / 100);
		// tuned up, the recording sounds on a lower key: the key center moves down (sf2-to-opxy
		// adds the coarse tune to the root instead, which transposes the other way)
		const center = z.rootKey - z.coarseTune - semitones;
		if (center < 0 || center > 127) warnings.add('roots beyond midi 0–127: clamped');
		const tuned = { ...c, root: clamp(center, 0, 127), tune: cents - 100 * semitones };
		const other = byRoot.get(tuned.root);
		if (other) warnings.add('zones sharing a root: kept the one that plays the most keys');
		if (!other || tuned.keys.length > other.keys.length) byRoot.set(tuned.root, tuned);
	}
	const sorted = [...byRoot.values()].sort((a, b) => a.root - b.root);
	if (sorted.some((t) => t.playable.zone.scaleTuning !== 100)) {
		warnings.add('scale tuning other than 100 cents a key: played as a keyboard plays');
	}
	if (sorted.length <= MAX_ZONES) return sorted;
	warnings.add(
		`a multisample holds ${MAX_ZONES} zones: kept ${MAX_ZONES} of ${sorted.length}, spread over its range`
	);
	return spread(sorted, MAX_ZONES);
}

/** A kit sound: its zone and the SoundFont key it stands for. */
interface KitSound extends Choice {
	readonly key: number;
}

/** A kit's sounds by key, at most 24 in a row. */
function kit(sf: SoundFont, zones: readonly Playable[], warnings: Set<string>): KitSound[] {
	let sounds = choose(sf, zones, warnings)
		// a zone over several keys stands on the one that plays it as recorded, else its lowest
		.map((c) => ({
			...c,
			key: c.keys.includes(c.playable.zone.rootKey) ? c.playable.zone.rootKey : c.keys[0]
		}))
		.sort((a, b) => a.key - b.key);
	if (sounds.length > DRUM_KEYS) {
		// from GM's first kick, so a GS kit's clicks and scratches below it make way
		const kick = sounds.findIndex((s) => s.key >= GM_KICK);
		const from = Math.min(kick < 0 ? sounds.length : kick, sounds.length - DRUM_KEYS);
		warnings.add(
			`a kit holds ${DRUM_KEYS} sounds: kept midi notes ${sounds[from].key}–${sounds[from + DRUM_KEYS - 1].key}, ${sounds.length - DRUM_KEYS} left out`
		);
		sounds = sounds.slice(from, from + DRUM_KEYS);
	}
	const classes = new Set(sounds.map((s) => s.playable.zone.exclusiveClass).filter((c) => c > 0));
	if (classes.size > 1) {
		warnings.add('several choke groups: on the device they all choke each other');
	}
	return sounds;
}

/** Points `from` … `to` − 1 as floats in −1…1, with the 24-bit low bytes when the file has them. */
function decode(sf: SoundFont, { from, to }: Playable): Float32Array {
	const view = new DataView(sf.smpl.buffer, sf.smpl.byteOffset, sf.smpl.byteLength);
	const out = new Float32Array(to - from);
	for (let i = 0; i < out.length; i++) {
		const high = view.getInt16(2 * (from + i), true);
		out[i] = sf.sm24 ? (high * 256 + sf.sm24[from + i]) / 8388608 : high / 32768;
	}
	return out;
}

/** The SoundFont's loop in frames of the zone's audio, or null when it has none worth keeping. */
function loopOf(sample: SoundFontSample, p: Playable, frames: number): LoopEdit | null {
	const start = sample.loopStart + p.zone.loopStartOffset - p.from;
	const end = sample.loopEnd + p.zone.loopEndOffset - p.from;
	if (start >= end || end <= 0 || start >= frames) return null;
	const s = clamp(start, 0, frames - 1);
	const e = clamp(end, s + 1, frames);
	// a loop of a few points at the very end is how many SoundFonts mark a one-shot (sf2-to-opxy)
	if (e - s <= 3 && frames - e <= 4) return null;
	const mode: LoopMode =
		p.zone.sampleMode === 1 ? 'forever' : p.zone.sampleMode === 3 ? 'release' : 'off';
	return { mode, start: s, end: e, crossfade: 0 };
}

/**
 * A chosen zone's audio at its sample's own rate (a stereo pair as left and right) and its edit:
 * all of it, the SoundFont's loop (multisampler) and level, then `own`, made valid by clampEdit.
 */
function render(
	sf: SoundFont,
	c: Choice,
	kind: SoundFontImport['kind'],
	own: Partial<SoundEdit>,
	warnings: Set<string>
): { audio: PcmAudio; edit: SoundEdit; name: string } {
	const sample = sf.samples[c.playable.zone.sample];
	let channels = [decode(sf, c.playable)];
	let name = sample.name;
	if (c.partner) {
		const other = decode(sf, c.partner);
		const frames = Math.min(channels[0].length, other.length);
		channels = (sample.type === LEFT ? [channels[0], other] : [other, channels[0]]).map((ch) =>
			ch.length === frames ? ch : ch.slice(0, frames)
		);
		name = name.replace(STEREO_MARK, '').trim();
	}
	const audio: PcmAudio = { sampleRate: sample.sampleRate, channels };
	const frames = channels[0].length;
	const base = defaultEdit(audio, kind, { trim: false });
	const loop = kind === 'drum' ? null : loopOf(sample, c.playable, frames);
	const attenuation = c.playable.zone.attenuation;
	const edit = clampEdit(
		{
			...base,
			loop: loop ?? { ...base.loop, mode: 'off' },
			// players take attenuation below 0 as 0: a SoundFont never plays louder than its sample
			gain: attenuation > 0 ? -attenuation / 10 : 0,
			...own
		},
		frames
	);
	if (!loop || loop.mode === 'off') return { audio, edit, name };
	if (edit.loop.start !== loop.start || edit.loop.end !== loop.end) {
		warnings.add(
			`loops shorter than ${MIN_SPAN} frames were lengthened: they may sound out of tune`
		);
	}
	// the fade-out is written into the audio: it stays after the loop's end, or every pass dips
	const fadeOut = Math.min(edit.fadeOut, edit.end - edit.loop.end);
	return { audio, edit: clampEdit({ ...edit, fadeOut }, frames), name };
}

/**
 * A preset of the SoundFont as samples for `buildPreset`: a multisampler (the zones played at
 * velocity 100, one per root, at most 24 spread over the range, each with its root, loop, tune in
 * cents and gain in dB) or a drum kit (one sound per key, at most 24 in key order on keys 53 on,
 * each at root 60 with the transpose, pan and gain the SoundFont plays it at, in the kit's mute
 * group when it has an exclusive class). Audio stays at each sample's own rate and length: the
 * builder resamples and cuts. `presetIndex` is a preset's `index`; throws {@link Sf2Error} for
 * one the SoundFont does not have.
 */
export function soundFontSamples(
	sf: SoundFont,
	presetIndex: number,
	options: SoundFontImportOptions = {}
): SoundFontImport {
	const preset = sf.presets.find((p) => p.index === presetIndex);
	if (!preset) throw new Sf2Error(`this SoundFont has no preset ${presetIndex}`);
	const kind = options.kind ?? (preset.drum ? 'drum' : 'multisampler');
	const warnings = new Set<string>();
	const all = sf.zones[presetIndex];
	const zones = all.flatMap((z) => playable(sf, z) ?? []);
	if (zones.length < all.length) {
		warnings.add('zones whose samples the file does not hold: left out');
	}
	let samples: SampleInput[];
	if (kind === 'drum') {
		samples = kit(sf, zones, warnings).map((c, i) => {
			const z = c.playable.zone;
			// what the SoundFont plays on the kit's key, in semitones from the recording
			const cents =
				(c.key - z.rootKey) * z.scaleTuning +
				100 * z.coarseTune +
				z.fineTune +
				sf.samples[z.sample].pitchCorrection;
			const transpose = Math.round(cents / 100) || 0;
			if (Math.abs(transpose) > EDIT_RANGES.transpose.max) {
				warnings.add(`drum pitches beyond ±${EDIT_RANGES.transpose.max} semitones: clamped`);
			}
			const { audio, edit, name } = render(
				sf,
				c,
				'drum',
				{
					transpose,
					// a stereo pair's pans only place its halves
					pan: c.partner ? 0 : z.pan / 5,
					playmode: z.exclusiveClass > 0 ? 'group' : 'oneshot'
				},
				warnings
			);
			const label = name || `${preset.name} ${noteName(c.key)}`;
			return { name: label, audio, root: 60, key: DRUM_FIRST_KEY + i, edit };
		});
	} else {
		samples = multisample(sf, zones, warnings).map((c) => {
			const { audio, edit } = render(sf, c, 'multisampler', { tune: c.tune }, warnings);
			return { name: `${preset.name} ${noteName(c.root)}`, audio, root: c.root, edit };
		});
	}
	if (samples.length === 0) warnings.add('this preset plays no samples');
	return { name: preset.name, kind, samples, warnings: [...warnings] };
}
