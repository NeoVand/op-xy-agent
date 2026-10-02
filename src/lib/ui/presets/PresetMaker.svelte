<!--
@component
The preset maker: a workbench in the OP-XY's own materials where its 24 keys are the canvas
(docs/research/30-presets-samples.md). Drop audio anywhere and it lands at once: a folder of hits
on TE's factory layout by what each sound is, a loop cut at its hits, notes of an instrument as a
multisample, one note as a synth sampler; drop on a key to put a sound right there, drag a key onto
another to swap them. Press a key (or the computer's: the Z row is F3–E4, the Q row F4–E5, black
keys above) to hear it and edit it on the screen with the four encoders, each writing the
patch.json field it names. The beat key plays a groove through the kit (the loop back together, a
run or an arpeggio for instruments). The strip below says what the device takes; download the
`.preset` or install it over USB (`PresetInstall`). Everything stays in this browser.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { KEYBOARD_NOTE_NAMES } from '$lib/core/opxy';
	import {
		DRUM_FIRST_KEY,
		DRUM_KINDS,
		EDIT_RANGES,
		GROOVES,
		GROOVE_BPM,
		KIT_STYLES,
		MELODIES,
		TE_LAYOUT,
		VOICE_RANGES,
		groovePattern,
		megabytes,
		melodyPattern,
		noteName,
		partKeys,
		slicePattern,
		voiceValue,
		parseSoundFont,
		parseSfz,
		readPreset,
		safeName,
		sfzSamples,
		unzip,
		zipPreset,
		type Inflate,
		type PresetFile,
		type BeatPattern,
		type BenchMode,
		type DrumPlayMode,
		type Groove,
		type LoopMode,
		type Melody,
		type PcmAudio,
		type SoundEdit,
		type VoiceParam,
		type VoiceType
	} from '$lib/core/presets';
	import { getPresetInbox } from '$lib/app/preset-inbox.svelte';
	import { getAppSimulator, getAppSound, getSimPersistence } from '$lib/app';
	import { createVirtualOpxy } from '$lib/app/virtual';
	import { NOTE_CODES } from '$lib/replica/keyboard';
	import { browserUsb } from '$lib/device';
	import { Button, Legend, Led, Switch, tooltip } from '$lib/ui';
	import { Workbench, type BenchSound, type Cut } from './bench.svelte';
	import { decodeAudioFile } from './decode';
	import { droppedEntries, type DroppedFile } from './files';
	import Encoder from './Encoder.svelte';
	import KeyBench from './KeyBench.svelte';
	import PresetInstall from './PresetInstall.svelte';
	import { PreviewPlayer } from './player';
	import { MicRecorder, TAKE_SECONDS } from './recorder';
	import WaveScreen from './WaveScreen.svelte';

	const bench = new Workbench();
	const player = new PreviewPlayer();

	const MODES: readonly { id: BenchMode; label: string; hint: string }[] = [
		{ id: 'drum', label: 'drum kit', hint: 'up to 24 hits, one on each key' },
		{ id: 'slices', label: 'slices', hint: 'one loop cut into up to 24 slices' },
		{ id: 'multisampler', label: 'multisample', hint: 'up to 24 notes of one instrument' },
		{ id: 'sampler', label: 'synth sampler', hint: 'one sound played across the keys' }
	];
	const PLAYMODES: readonly { id: DrumPlayMode; label: string }[] = [
		{ id: 'gate', label: 'key' },
		{ id: 'oneshot', label: 'one-shot' },
		{ id: 'group', label: 'mute grp' },
		{ id: 'loop', label: 'loop' }
	];
	const LOOPS: readonly { id: LoopMode; label: string }[] = [
		{ id: 'forever', label: 'forever' },
		{ id: 'release', label: 'til release' },
		{ id: 'off', label: 'off' }
	];
	const CUTS: readonly { id: Cut; label: string }[] = [
		{ id: 'hits', label: 'hits' },
		{ id: '8', label: '8' },
		{ id: '16', label: '16' },
		{ id: '24', label: '24' }
	];

	const instrument = $derived(bench.mode === 'multisampler' || bench.mode === 'sampler');
	const current = $derived(bench.current);

	// ------------------------------------------------------------------ the encoders' pages

	type Page = 'trim' | 'tone' | 'loop' | 'voice' | 'grit' | 'cuts';
	let page = $state<Page>('trim');

	const pages = $derived.by((): Page[] => {
		if (bench.mode === 'slices') return current ? ['cuts', 'tone', 'trim'] : ['cuts'];
		if (!current) return [];
		if (instrument) return ['trim', 'loop', 'tone'];
		return current.voice ? ['trim', 'tone', 'voice', 'grit'] : ['trim', 'tone'];
	});
	const shown = $derived<Page>(pages.includes(page) ? page : (pages[0] ?? 'trim'));

	interface Knob {
		readonly label: string;
		readonly value: number;
		readonly min: number;
		readonly max: number;
		readonly step: number;
		readonly display: string;
		readonly field: string;
		readonly reset?: number;
		readonly disabled?: boolean;
		readonly set: (v: number) => void;
	}

	const RATE = 44100;
	const ms = (frames: number) => {
		const s = frames / RATE;
		return s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`;
	};
	const signed = (v: number, unit = '') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${unit}`;

	function change(patch: Partial<SoundEdit>) {
		if (current) bench.edit(current.id, patch);
	}

	/** The voice numbers each generated type listens to (generate.ts); the others do nothing. */
	const VOICE_USES: Readonly<Record<VoiceType, readonly VoiceParam[]>> = {
		kick: ['pitch', 'decay', 'sweep', 'snap'],
		snare: ['pitch', 'decay', 'snap', 'tone'],
		clap: ['decay', 'tone'],
		rim: ['decay'],
		'closed hat': ['decay', 'tone'],
		'open hat': ['decay', 'tone'],
		cymbal: ['decay', 'tone'],
		tom: ['pitch', 'decay', 'sweep'],
		conga: ['pitch', 'decay', 'sweep'],
		cowbell: ['decay', 'tone'],
		clave: ['decay'],
		shaker: ['decay', 'tone'],
		tambourine: ['decay', 'tone'],
		triangle: ['decay'],
		guiro: ['decay', 'tone'],
		zap: ['decay', 'sweep']
	};

	function voiceKnob(sound: BenchSound, param: VoiceParam, label: string): Knob {
		const voice = sound.voice;
		const range =
			param === 'pitch'
				? voice?.type === 'kick'
					? { min: 30, max: 120 }
					: { min: 40, max: 1200 }
				: VOICE_RANGES[param];
		const value = voice ? voiceValue(voice, param) : 0;
		const step = param === 'pitch' ? 1 : 0.01;
		// drive, crush and level shape every voice; the rest only the types that use them
		const used =
			!voice ||
			['drive', 'crush', 'level'].includes(param) ||
			VOICE_USES[voice.type].includes(param);
		return {
			label,
			value,
			min: range.min,
			max: range.max,
			step,
			display: !used
				? '—'
				: param === 'pitch'
					? `${Math.round(value)} hz`
					: param === 'decay'
						? `${value.toFixed(2)} s`
						: `${Math.round(value * 100)}`,
			field: used
				? `the generated ${voice?.type ?? ''}'s ${param} (rendered into the wav)`
				: `a ${voice?.type ?? ''} has no ${param}`,
			disabled: !used,
			set: (v) => bench.setVoice(sound.id, param, v)
		};
	}

	const knobs = $derived.by((): Knob[] => {
		const s = current;
		if (shown === 'cuts') {
			const cutIndex = CUTS.findIndex((c) => c.id === bench.cut);
			return [
				{
					label: 'cut at',
					value: cutIndex,
					min: 0,
					max: CUTS.length - 1,
					step: 1,
					display: bench.cut === 'hits' ? 'the hits' : `${bench.cut} equal`,
					field: 'where the loop is cut',
					set: (v) => {
						bench.cut = CUTS[Math.round(v)].id;
						bench.recut();
					}
				},
				{
					label: 'sensitivity',
					value: bench.sensitivity,
					min: 0,
					max: 100,
					step: 1,
					display: String(bench.sensitivity),
					field: 'how small a hit still starts a slice',
					disabled: bench.cut !== 'hits',
					set: (v) => {
						bench.sensitivity = Math.round(v);
						bench.recut();
					}
				},
				{
					label: 'slices',
					value: bench.cuts.length,
					min: 0,
					max: 24,
					step: 1,
					display: String(bench.cuts.length),
					field: 'keys from f3 up, each choking the last (the mute group)',
					disabled: true,
					set: () => {}
				},
				{
					label: 'tempo',
					value: bench.tempo?.bpm ?? 0,
					min: 0,
					max: 300,
					step: 1,
					display: bench.tempo ? `${bench.tempo.bpm}` : '—',
					field: bench.tempo ? `the loop is ${bench.tempo.beats} beats long` : 'no tempo found',
					disabled: true,
					set: () => {}
				}
			];
		}
		if (!s) return [];
		const frames = s.audio.channels[0].length;
		const e = s.edit;
		const msStep = 44;
		if (shown === 'trim') {
			return [
				{
					label: 'start',
					value: e.start,
					min: 0,
					max: frames,
					step: msStep,
					display: ms(e.start),
					field: 'sample.start',
					reset: 0,
					set: (v) => change({ start: v })
				},
				{
					label: 'end',
					value: e.end,
					min: 0,
					max: frames,
					step: msStep,
					display: ms(e.end),
					field: 'sample.end',
					reset: frames,
					set: (v) => change({ end: v })
				},
				{
					label: 'fade in',
					value: e.fadeIn,
					min: 0,
					max: Math.max(1, e.end - e.start),
					step: msStep,
					display: ms(e.fadeIn),
					field: 'written into the wav (the fade field is unverified)',
					reset: 0,
					set: (v) => change({ fadeIn: v })
				},
				{
					label: 'fade out',
					value: e.fadeOut,
					min: 0,
					max: Math.max(1, e.end - e.start),
					step: msStep,
					display: ms(e.fadeOut),
					field: 'written into the wav (the fade field is unverified)',
					reset: 0,
					set: (v) => change({ fadeOut: v })
				}
			];
		}
		if (shown === 'tone' && !instrument) {
			const index = PLAYMODES.findIndex((p) => p.id === e.playmode);
			return [
				{
					label: 'level',
					value: e.gain,
					...EDIT_RANGES.gain,
					step: 1,
					display: signed(e.gain, ' db'),
					field: 'gain, −30…+20 db',
					reset: 0,
					set: (v) => change({ gain: v })
				},
				{
					label: 'pan',
					value: e.pan,
					...EDIT_RANGES.pan,
					step: 1,
					display: e.pan === 0 ? 'centre' : `${Math.abs(e.pan)} ${e.pan < 0 ? 'l' : 'r'}`,
					field: 'pan, −100…+100',
					reset: 0,
					set: (v) => change({ pan: v })
				},
				{
					label: 'pitch',
					value: e.transpose,
					...EDIT_RANGES.transpose,
					step: 1,
					display: signed(e.transpose, ' st'),
					field: 'transpose, ±48 semitones',
					reset: 0,
					set: (v) => change({ transpose: v })
				},
				{
					label: 'play',
					value: index,
					min: 0,
					max: PLAYMODES.length - 1,
					step: 1,
					display: PLAYMODES[index]?.label ?? '',
					field: 'playmode: gate, oneshot, group, loop',
					reset: 1,
					set: (v) => change({ playmode: PLAYMODES[Math.round(v)].id })
				}
			];
		}
		if (shown === 'tone') {
			return [
				{
					label: 'level',
					value: e.gain,
					...EDIT_RANGES.gain,
					step: 1,
					display: signed(e.gain, ' db'),
					field: 'gain, −30…+20 db',
					reset: 0,
					set: (v) => change({ gain: v })
				},
				{
					label: 'tune',
					value: e.tune,
					...EDIT_RANGES.tune,
					step: 1,
					display: signed(e.tune, ' ct'),
					field: 'tune, cents',
					reset: 0,
					set: (v) => change({ tune: v })
				},
				{
					label: 'root',
					value: s.root ?? 60,
					min: 0,
					max: 127,
					step: 1,
					display: noteName(s.root ?? 60),
					field: 'pitch.keycenter: the note it was played at',
					set: (v) => bench.setRoot(s.id, v)
				},
				{
					label: 'direction',
					value: e.reverse ? 1 : 0,
					min: 0,
					max: 1,
					step: 1,
					display: e.reverse ? 'reverse' : 'forward',
					field: 'reverse',
					reset: 0,
					set: (v) => change({ reverse: v > 0.5 })
				}
			];
		}
		if (shown === 'loop') {
			const index = LOOPS.findIndex((l) => l.id === e.loop.mode);
			const off = e.loop.mode === 'off';
			return [
				{
					label: 'loop start',
					value: e.loop.start,
					min: e.start,
					max: e.end,
					step: msStep,
					display: ms(e.loop.start),
					field: 'loop.start',
					disabled: off,
					set: (v) => change({ loop: { ...e.loop, start: v } })
				},
				{
					label: 'loop end',
					value: e.loop.end,
					min: e.start,
					max: e.end,
					step: msStep,
					display: ms(e.loop.end),
					field: 'loop.end',
					disabled: off,
					set: (v) => change({ loop: { ...e.loop, end: v } })
				},
				{
					label: 'crossfade',
					value: e.loop.crossfade,
					min: 0,
					max: Math.max(1, Math.min(e.loop.end - e.loop.start, e.loop.start)),
					step: msStep,
					display: ms(e.loop.crossfade),
					field: 'loop.crossfade',
					disabled: off,
					reset: 0,
					set: (v) => change({ loop: { ...e.loop, crossfade: v } })
				},
				{
					label: 'loop',
					value: index,
					min: 0,
					max: LOOPS.length - 1,
					step: 1,
					display: LOOPS[index]?.label ?? '',
					field: 'loop.onrelease (forever), loop.enabled false (off), neither (until release)',
					set: (v) => change({ loop: { ...e.loop, mode: LOOPS[Math.round(v)].id } })
				}
			];
		}
		if (shown === 'voice') {
			return [
				voiceKnob(s, 'pitch', 'pitch'),
				voiceKnob(s, 'decay', 'decay'),
				voiceKnob(s, 'tone', 'tone'),
				voiceKnob(s, 'snap', 'snap')
			];
		}
		return [
			voiceKnob(s, 'sweep', 'sweep'),
			voiceKnob(s, 'drive', 'drive'),
			voiceKnob(s, 'crush', 'crush'),
			voiceKnob(s, 'level', 'level')
		];
	});

	const cells = $derived(
		knobs.map((k, i) => ({
			label: k.label,
			value: k.disabled && k.display === '' ? '—' : k.display,
			encoder: (i + 1) as 1 | 2 | 3 | 4
		}))
	);

	// ------------------------------------------------------------------ playing

	const lit = new SvelteSet<number>();
	// bookkeeping only (never drawn): which LED timer and computer key belong to which key
	const timers: Record<number, ReturnType<typeof setTimeout>> = {};

	/** Lights a key's LED for `seconds` (at least a blink the eye catches). */
	function flash(key: number, seconds: number) {
		lit.add(key);
		clearTimeout(timers[key]);
		const ms = Math.max(90, Math.min(4000, seconds * 1000));
		timers[key] = setTimeout(() => lit.delete(key), ms);
	}

	/** What the screen's playhead follows. */
	let playing = $state.raw<{
		t0: number;
		speed: number;
		from: number;
		to: number;
		reverse: boolean;
		loop: { start: number; end: number } | null;
	} | null>(null);

	function sound(key: number) {
		player.unlock();
		const voice = bench.voiceFor(key);
		if (!voice) return;
		const drum = !instrument;
		const seconds = player.play(`k${key}`, voice.sound, {
			semitones: voice.semitones,
			drum,
			velocity: 0.9
		});
		if (seconds === 0) return;
		lit.add(key);
		clearTimeout(timers[key]);
		if (Number.isFinite(seconds)) flash(key, Math.min(seconds, 0.6));
		if (voice.sound.id === bench.selected) {
			const e = voice.sound.edit;
			const loops = drum ? e.playmode === 'loop' : e.loop.mode !== 'off';
			playing = {
				t0: performance.now(),
				speed: voice.sound.audio.sampleRate * 2 ** (voice.semitones / 12),
				from: e.start,
				to: e.end,
				reverse: e.reverse,
				loop: loops ? (drum ? { start: e.start, end: e.end } : e.loop) : null
			};
		}
	}

	function press(key: number) {
		bench.pick(key);
		sound(key);
	}

	function release(key: number) {
		player.release(`k${key}`);
		const e = bench.voiceFor(key)?.sound.edit;
		const holds = instrument || e?.playmode === 'gate' || e?.playmode === 'loop';
		if (holds) {
			flash(key, 0.12);
			if (bench.voiceFor(key)?.sound.id === bench.selected) playing = null;
		}
	}

	// ------------------------------------------------------------------ the beat

	let beat = $state(false);
	let groove = $state<Groove>('house');
	let melody = $state<Melody>('arpeggio');
	let bpm = $state(GROOVE_BPM.house);
	let shuffle = $state(0);
	let beatTimer: ReturnType<typeof setInterval> | null = null;
	let loopAt = 0;
	let cursor = 0;
	let pattern: BeatPattern | null = null;

	function currentPattern(): BeatPattern {
		if (bench.mode === 'slices') {
			const frames = bench.loop?.audio.channels[0].length ?? 0;
			return slicePattern(bench.cuts, frames, RATE, shuffle);
		}
		if (instrument) {
			const keys = Array.from({ length: 24 }, (_, i) => DRUM_FIRST_KEY + i);
			return melodyPattern(melody, keys, bpm);
		}
		const kinds = bench.kit.map((s, i) => (s ? (s.kind ?? TE_LAYOUT[i]) : null));
		return groovePattern(groove, partKeys(kinds), bpm);
	}

	function tick() {
		const context = player.context;
		if (!context || !pattern) return;
		const horizon = context.currentTime + 0.15;
		// a pattern with nothing in it still moves on, bar by bar
		for (let guard = 0; guard < 256; guard++) {
			if (cursor >= pattern.events.length) {
				loopAt += pattern.length;
				cursor = 0;
				pattern = currentPattern();
				if (loopAt > horizon) break;
				continue;
			}
			const event = pattern.events[cursor];
			const when = loopAt + event.time;
			if (when > horizon) break;
			cursor++;
			const voice = bench.voiceFor(event.key);
			if (!voice) continue;
			player.play(`b${event.key}`, voice.sound, {
				semitones: voice.semitones,
				drum: !instrument,
				velocity: event.velocity,
				when,
				hold: event.length
			});
			const delay = Math.max(0, (when - context.currentTime) * 1000);
			setTimeout(() => flash(event.key, Math.min(0.14, event.length)), delay);
		}
	}

	function startBeat() {
		const context = player.unlock();
		if (!context) return;
		pattern = currentPattern();
		loopAt = context.currentTime + 0.06;
		cursor = 0;
		beat = true;
		beatTimer = setInterval(tick, 25);
		tick();
	}

	function stopBeat() {
		beat = false;
		if (beatTimer) clearInterval(beatTimer);
		beatTimer = null;
		player.stopAll();
	}

	const toggleBeat = () => (beat ? stopBeat() : startBeat());

	function setGroove(next: Groove) {
		groove = next;
		bpm = GROOVE_BPM[next];
	}

	// ------------------------------------------------------------------ files

	let receiving = $state(false);
	/** The file being read, while a drop is read. */
	let reading = $state('');
	let depth = 0;

	async function addFiles(files: readonly File[], key?: number) {
		if (files.length === 0) return;
		player.unlock();
		bench.busy = true;
		const decoded: { name: string; audio: PcmAudio }[] = [];
		const skipped: string[] = [];
		try {
			for (const [i, file] of files.entries()) {
				reading = files.length > 1 ? `${i + 1} of ${files.length}: ${file.name}` : file.name;
				try {
					decoded.push({ name: file.name, audio: await decodeAudioFile(file) });
				} catch {
					skipped.push(file.name);
				}
				// let the page breathe between files
				await new Promise((r) => setTimeout(r, 0));
			}
			if (decoded.length > 0) {
				stopBeat();
				bench.add(decoded, key);
				page = bench.mode === 'slices' ? 'cuts' : 'trim';
				chase();
				if (bench.key !== null) sound(bench.key);
			}
			if (skipped.length > 0) {
				bench.say(
					`not audio this browser can read: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`
				);
			}
		} finally {
			bench.busy = false;
		}
	}

	/** Every key that holds something lights in turn: the drop landed. */
	function chase() {
		const keys = Array.from({ length: 24 }, (_, i) => DRUM_FIRST_KEY + i).filter((k) =>
			bench.voiceFor(k)
		);
		keys.forEach((k, i) => setTimeout(() => flash(k, 0.12), i * 28));
	}

	/** Inflates a zip's deflated entries with the browser's own decompressor. */
	const inflate: Inflate = async (raw) =>
		new Uint8Array(
			await new Response(
				new Blob([raw as Uint8Array<ArrayBuffer>])
					.stream()
					.pipeThrough(new DecompressionStream('deflate-raw'))
			).arrayBuffer()
		);

	/**
	 * What a drop holds: an existing preset (a zip, or a folder with its patch.json) opens to be
	 * edited; a zip of samples gives its audio; anything else is audio, a dropped folder's name
	 * naming the preset.
	 */
	async function addDropped(entries: readonly DroppedFile[], key?: number) {
		// a SoundFont: its first instrument (or kit) on the keys, the others a pick away
		const font = entries.find((e) => /\.sf2$/i.test(e.path));
		if (font) {
			try {
				player.unlock();
				const parsed = parseSoundFont(new Uint8Array(await font.file.arrayBuffer()));
				const first = parsed.presets.find((p) => !p.drum) ?? parsed.presets[0];
				if (!first) throw new Error(`${font.file.name} holds no presets`);
				stopBeat();
				bench.openSoundFont(parsed, first.index);
				page = 'trim';
				chase();
			} catch (error) {
				bench.say(error instanceof Error ? error.message : String(error));
			}
			return;
		}
		// an SFZ instrument: its text, and the samples beside it in the dropped folder
		const sfz = entries.find((e) => /\.sfz$/i.test(e.path));
		if (sfz) {
			try {
				player.unlock();
				await openSfz(sfz, entries);
			} catch (error) {
				bench.say(error instanceof Error ? error.message : String(error));
			}
			return;
		}
		const zip = entries.find((e) => /\.zip$/i.test(e.path));
		const hasPatch = entries.some((e) => /(^|\/)patch\.json$/i.test(e.path));
		if (zip || hasPatch) {
			try {
				const files: PresetFile[] = zip
					? await unzip(new Uint8Array(await zip.file.arrayBuffer()), inflate)
					: await Promise.all(
							entries.map(async (e) => ({
								path: e.path,
								bytes: new Uint8Array(await e.file.arrayBuffer())
							}))
						);
				if (files.some((f) => /(^|\/)patch\.json$/i.test(f.path))) {
					stopBeat();
					bench.openPreset(readPreset(files));
					page = 'trim';
					chase();
					return;
				}
				// a zip of samples: its audio, as if dropped
				const audio = files
					.filter((f) => /\.(wav|aiff?|flac|mp3|ogg|m4a)$/i.test(f.path))
					.map(
						(f) => new File([f.bytes as Uint8Array<ArrayBuffer>], f.path.split('/').pop() ?? f.path)
					);
				bench.source = bench.empty ? stem(zip?.file.name ?? '') : bench.source;
				await addFiles(audio, key);
			} catch (error) {
				bench.say(error instanceof Error ? error.message : String(error));
			}
			return;
		}
		const folder = entries.find((e) => e.path.includes('/'))?.path.split('/')[0];
		if (folder && bench.empty && key === undefined) bench.source = folder;
		await addFiles(
			entries.map((e) => e.file),
			key
		);
	}

	const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, '');

	/** A path with its `.` and `..` segments walked, forward slashes, no leading slash. */
	function normal(path: string): string {
		const out: string[] = [];
		for (const part of path.replace(/\\/g, '/').split('/')) {
			if (part === '..') out.pop();
			else if (part && part !== '.') out.push(part);
		}
		return out.join('/');
	}

	/** Opens an SFZ instrument as a multisample, its samples found beside it in the drop. */
	async function openSfz(sfz: DroppedFile, entries: readonly DroppedFile[]) {
		const regions = parseSfz(await sfz.file.text());
		const folder = sfz.path.includes('/') ? sfz.path.slice(0, sfz.path.lastIndexOf('/') + 1) : '';
		const byPath = new Map(entries.map((e) => [normal(e.path).toLowerCase(), e]));
		const byName = new Map(entries.map((e) => [e.file.name.toLowerCase(), e]));
		const find = (sample: string) =>
			byPath.get(normal(folder + sample).toLowerCase()) ??
			byName.get((sample.split('/').pop() ?? sample).toLowerCase());
		// bookkeeping for this one import, never drawn
		const decoded: Record<string, PcmAudio> = {};
		bench.busy = true;
		try {
			for (const sample of new Set(regions.map((r) => r.sample))) {
				const entry = find(sample);
				if (!entry) continue;
				reading = entry.file.name;
				try {
					decoded[sample] = await decodeAudioFile(entry.file);
				} catch {
					// a file the browser cannot read counts as missing
				}
			}
		} finally {
			bench.busy = false;
		}
		const { samples, warnings } = sfzSamples(regions, (path) => decoded[path] ?? null);
		stopBeat();
		bench.openPreset({
			kind: 'multisampler',
			name: safeName(stem(sfz.file.name), 24),
			samples,
			patch: {},
			warnings
		});
		const noted = warnings.length > 0 ? `: ${warnings[0]}` : '';
		bench.say(`${sfz.file.name}: ${samples.length} zones${noted}`);
		page = 'loop';
		chase();
	}

	async function onDrop(event: DragEvent) {
		event.preventDefault();
		receiving = false;
		depth = 0;
		if (!event.dataTransfer) return;
		await addDropped(await droppedEntries(event.dataTransfer));
	}

	function onDragEnter(event: DragEvent) {
		if (!event.dataTransfer?.types.includes('Files')) return;
		depth++;
		receiving = true;
	}

	function onDragLeave() {
		depth = Math.max(0, depth - 1);
		if (depth === 0) receiving = false;
	}

	function choose() {
		const picker = document.createElement('input');
		picker.type = 'file';
		picker.accept = 'audio/*,.wav,.aif,.aiff,.flac,.mp3,.ogg,.m4a,.zip,.sf2,.sfz';
		picker.multiple = true;
		picker.onchange = () => {
			if (picker.files?.length) {
				void addDropped(Array.from(picker.files, (file) => ({ file, path: file.name })));
			}
		};
		picker.click();
	}

	// ------------------------------------------------------------------ the microphone

	const mic = new MicRecorder();
	let recording = $state(false);
	// how long the take has run, for the live line over the screen
	let takeSeconds = $state(0);
	let takeStarted = 0;
	let takeTimer: ReturnType<typeof setInterval> | null = null;

	/** Where a take goes: the key being edited, else the first empty one (a kit), else the whole preset. */
	function takeKey(): number | undefined {
		if (bench.mode === 'drum') {
			if (bench.key !== null) return bench.key;
			const free = bench.kit.findIndex((s) => s === null);
			return free >= 0 ? DRUM_FIRST_KEY + free : undefined;
		}
		if (bench.mode === 'multisampler') return bench.key ?? undefined;
		return undefined;
	}

	const recordTip = $derived(
		recording
			? 'stop the take'
			: `record from the microphone onto ${
					bench.mode === 'drum'
						? `the key being edited (at most ${TAKE_SECONDS} s)`
						: bench.mode === 'multisampler'
							? 'the key being edited, as a new zone'
							: bench.mode === 'slices'
								? 'the loop, to slice'
								: 'the synth sampler'
				}`
	);

	async function toggleRecord() {
		if (recording) {
			mic.stop();
			return;
		}
		player.unlock();
		stopBeat();
		const key = takeKey();
		try {
			await mic.start((file) => {
				recording = false;
				if (takeTimer) clearInterval(takeTimer);
				void addDropped([{ file, path: file.name }], key);
			});
			recording = true;
			takeStarted = performance.now();
			takeSeconds = 0;
			takeTimer = setInterval(() => (takeSeconds = (performance.now() - takeStarted) / 1000), 100);
			const where = key !== undefined ? ` onto ${noteName(bench.noteOf(key))}` : '';
			bench.say(`recording${where}: rec again to stop, ${TAKE_SECONDS} s at most`);
		} catch (error) {
			recording = false;
			bench.say(
				error instanceof Error && error.name === 'NotAllowedError'
					? 'the microphone is not allowed on this page'
					: error instanceof Error
						? error.message
						: String(error)
			);
		}
	}

	// ------------------------------------------------------------------ the computer's keys

	const held: Record<string, number> = {};

	function typing(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (typing(event.target)) return;
		if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ' && !event.shiftKey) {
			event.preventDefault();
			stopBeat();
			bench.undo();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const name = NOTE_CODES[event.code];
		if (name) {
			event.preventDefault();
			if (event.repeat || event.code in held) return;
			const key = DRUM_FIRST_KEY + KEYBOARD_NOTE_NAMES.indexOf(name);
			held[event.code] = key;
			press(key);
			return;
		}
		// space plays and stops, as on a sequencer, even with a key focused: pressing a focused
		// "randomize" or "clear" again by accident would lose the kit (keys still take Enter)
		if (event.code === 'Space') {
			event.preventDefault();
			if (!event.repeat) toggleBeat();
			return;
		}
		if (instrument && (event.code === 'Minus' || event.code === 'Equal')) {
			event.preventDefault();
			bench.octave = Math.max(-3, Math.min(3, bench.octave + (event.code === 'Minus' ? -1 : 1)));
		}
	}

	function onKeyUp(event: KeyboardEvent) {
		const key = held[event.code];
		if (key === undefined) return;
		delete held[event.code];
		release(key);
	}

	function onBlur() {
		for (const [code, key] of Object.entries(held)) {
			delete held[code];
			release(key);
		}
	}

	// ------------------------------------------------------------------ the agent's kits

	// the view's one orchestrated moment: the keys light once, low to high, as the workbench wakes
	onMount(() => {
		const sweep = Array.from({ length: 24 }, (_, i) =>
			setTimeout(() => flash(DRUM_FIRST_KEY + i, 0.09), 250 + i * 26)
		);
		return () => sweep.forEach(clearTimeout);
	});

	const inbox = getPresetInbox();
	onMount(() =>
		inbox?.listen((draft) => {
			stopBeat();
			bench.useKit(draft.name, draft.samples);
			bench.say(`${draft.name}: made by the agent, ${draft.samples.length} sounds`);
			page = 'trim';
			chase();
		})
	);

	onDestroy(() => {
		// the kit stays for the agent, whose chat is on another page ("put my kit on track 2")
		const kit = bench.mode === 'drum' || bench.mode === 'slices' ? bench.kitForReplica() : [];
		inbox?.keep(kit.length > 0 ? { name: bench.presetName || 'kit', sounds: kit } : null);
		stopBeat();
		for (const t of Object.values(timers)) clearTimeout(t);
		player.close();
		mic.close();
		if (takeTimer) clearInterval(takeTimer);
	});

	// ------------------------------------------------------------------ export

	const usb = browserUsb();
	let installing = $state(false);
	let exported = $state<string | null>(null);

	async function build() {
		const built = bench.build();
		if (!built && bench.problems.length === 0) bench.say('nothing to write yet');
		return built;
	}

	async function download() {
		const built = await build();
		if (!built) return;
		const blob = new Blob([zipPreset(built) as Uint8Array<ArrayBuffer>], {
			type: 'application/zip'
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${built.folder}.zip`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		exported = built.folder;
		for (const w of built.warnings) bench.say(w);
		bench.say(`${built.folder}: ${built.files.length - 1} samples and patch.json, zipped`);
	}

	/** A context of the app shell, or null where there is none (a test, another shell). */
	function optional<T>(get: () => T): T | null {
		try {
			return get() ?? null;
		} catch {
			return null;
		}
	}
	// the replica's virtual OP-XY, its sound and its saving, so a kit can go on a track
	const simulator = optional(getAppSimulator);
	const appSound = optional(getAppSound);
	const persistence = optional(getSimPersistence);

	/** Puts the kit on track 1 of the replica and goes to it. */
	function toReplica() {
		try {
			if (!simulator) return;
			const virtual = createVirtualOpxy({
				sim: simulator.sim,
				sound: appSound,
				changed: () => persistence?.markDirty()
			});
			virtual.loadKit(1, { name: bench.presetName || 'kit', sounds: bench.kitForReplica() });
			virtual.selectTrack(1);
			void goto(resolve('/'));
		} catch (error) {
			bench.say(
				`could not put it on the replica: ${error instanceof Error ? error.message : error}`
			);
		}
	}

	const errors = $derived(bench.problems.filter((p) => p.level === 'error'));
	const warnings = $derived(bench.problems.filter((p) => p.level === 'warning'));
	const keysUsed = $derived(
		bench.mode === 'multisampler'
			? `${bench.zones.length} / 24 zones`
			: bench.mode === 'sampler'
				? `${bench.one ? 1 : 0} / 1 sound`
				: `${bench.sounds.length} / 24 keys`
	);
	const message = $derived(bench.note?.text ?? null);

	const title = $derived.by(() => {
		if (!current) return '';
		if (bench.mode === 'drum' || bench.mode === 'slices') {
			const index = bench.keys.findIndex((s) => s?.id === current.id);
			return index >= 0 ? noteName(DRUM_FIRST_KEY + index) : '';
		}
		return `root ${noteName(current.root ?? 60)}`;
	});
	const info = $derived.by(() => {
		const s = bench.mode === 'slices' ? bench.loop : current;
		if (!s) return '';
		const total = s.audio.channels[0].length;
		const region = s.edit.end - s.edit.start;
		const channels = s.audio.channels.length === 2 ? 'stereo' : 'mono';
		if (bench.mode === 'slices')
			return `${ms(total)} loop, ${channels}, ${bench.cuts.length} slices`;
		const why =
			current?.kindFrom === 'name'
				? `${current.kind} by its name`
				: current?.kindFrom === 'sound'
					? `${current.kind}: ${current.reason}`
					: current?.kindFrom === 'generated'
						? `generated ${current.voice?.type ?? ''}`
						: current?.rootFrom
							? `root from its ${current.rootFrom === 'guess' ? 'guess: set it' : current.rootFrom}`
							: '';
		return `${ms(region)} of ${ms(total)}, ${channels}${why ? `, ${why}` : ''}`;
	});
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} onblur={onBlur} />

<!-- the workbench is the instrument's own material: dark in either theme, as the replica is -->
<div
	class={['maker', receiving && 'is-receiving']}
	data-theme="dark"
	role="region"
	aria-label="preset workbench: drop audio files anywhere"
	ondragenter={onDragEnter}
	ondragleave={onDragLeave}
	ondragover={(event) => {
		if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
	}}
	ondrop={onDrop}
>
	<header class="bar">
		<div class="bar__modes" role="group" aria-label="what to make">
			{#each MODES as mode (mode.id)}
				<span {@attach tooltip(mode.hint)}>
					<Button
						size="sm"
						pressed={bench.mode === mode.id}
						onclick={() => {
							stopBeat();
							bench.setMode(mode.id);
							page = mode.id === 'slices' ? 'cuts' : 'trim';
						}}>{mode.label}</Button
					>
				</span>
			{/each}
		</div>
		<label class="name">
			<span class="name__label">name</span>
			<input
				class="name__input"
				bind:value={bench.name}
				maxlength="24"
				placeholder={bench.presetName || 'my preset'}
				spellcheck="false"
				autocomplete="off"
			/>
			<span class="name__folder" {@attach tooltip('the folder the device lists')}
				>{bench.folder}</span
			>
		</label>
		<div class="bar__actions">
			<Switch
				checked={bench.normalize}
				label="normalize"
				onchange={(on) => (bench.normalize = on)}
			/>
			<Button
				variant="primary"
				size="sm"
				disabled={errors.length > 0 || bench.sounds.length === 0}
				onclick={download}
			>
				download .preset
			</Button>
			{#if usb}
				<Button size="sm" pressed={installing} onclick={() => (installing = !installing)}
					>install</Button
				>
			{/if}
		</div>
		{#if installing && usb}
			<div class="install">
				<PresetInstall {build} disabled={errors.length > 0 || bench.sounds.length === 0} />
			</div>
		{/if}
	</header>

	<section class="deck" aria-label="the sound being edited">
		<div class="deck__screen">
			<WaveScreen
				mode={bench.mode}
				sound={bench.mode === 'slices' ? bench.loop : current}
				cuts={bench.cuts}
				slice={bench.mode === 'slices' && current ? -current.id - 1 : null}
				{cells}
				{title}
				subtitle={bench.mode === 'slices' ? (bench.loop?.name ?? '') : (current?.name ?? '')}
				{info}
				{message}
				playing={bench.mode === 'slices' ? null : playing}
				onedit={change}
				onmovecut={(i, f) => bench.moveCut(i, f)}
				onaddcut={(f) => bench.addCut(f)}
				onremovecut={(i) => bench.removeCut(i)}
				onpickslice={(i) => press(DRUM_FIRST_KEY + i)}
			>
				{#snippet empty()}
					<div class="welcome">
						<p class="welcome__title">drop sounds anywhere</p>
						{#if bench.busy}
							<p class="welcome__reading">
								<Led state="white" blink="breathe" size="sm" /> reading {reading}
							</p>
						{/if}
						<p class="welcome__text">
							A folder of hits becomes a kit laid out the way TE lays out theirs, a loop is sliced
							onto the keys, the notes of an instrument become a multisample, a SoundFont, an SFZ or
							a .preset opens as it is. Or drop straight onto a key.
						</p>
						<p class="welcome__keys">
							your keyboard plays the keys: <kbd>z</kbd>–<kbd>m</kbd> the lower twelve,
							<kbd>q</kbd>–<kbd>u</kbd> the upper, black keys on the rows above; <kbd>space</kbd> plays
							a beat
						</p>
						<div class="welcome__actions">
							<Button size="sm" onclick={choose}>choose files</Button>
							<span class="welcome__or">or make a kit from numbers</span>
							{#each KIT_STYLES as style (style)}
								<Button size="sm" variant="ghost" onclick={() => (bench.generate(style), chase())}
									>{style}</Button
								>
							{/each}
						</div>
					</div>
				{/snippet}
			</WaveScreen>
			{#if recording}
				<div class="live" aria-live="polite">
					<Led state="red" blink="breathe" size="sm" />
					recording {takeSeconds.toFixed(1)} s
				</div>
			{/if}
		</div>

		<div class="controls">
			<div class="encoders">
				{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
					{@const knob = knobs[i]}
					<Encoder
						encoder={(i + 1) as 1 | 2 | 3 | 4}
						label={knob?.label ?? ''}
						value={knob?.value ?? 0}
						min={knob?.min ?? 0}
						max={knob?.max ?? 1}
						step={knob?.step ?? 1}
						display={knob?.display}
						field={knob?.field}
						reset={knob?.reset}
						disabled={!knob || knob.disabled}
						onchange={(v) => knob?.set(v)}
					/>
				{/each}
			</div>

			<div class="pages" role="group" aria-label="encoder pages">
				{#each pages as p (p)}
					<Button size="sm" pressed={shown === p} onclick={() => (page = p)}>{p}</Button>
				{/each}
				{#if current}
					<span {@attach tooltip('reverse: plays from its end to its start')}>
						<Button
							size="sm"
							pressed={current.edit.reverse}
							onclick={() => current && change({ reverse: !current.edit.reverse })}>reverse</Button
						>
					</span>
				{/if}
				{#if current && bench.mode !== 'slices'}
					<Button size="sm" variant="ghost" onclick={() => current && bench.remove(current.id)}
						>remove</Button
					>
				{/if}
			</div>

			<div class="source">
				{#if bench.soundFont}
					{@const font = bench.soundFont}
					<span class="source__label">from the soundfont {font.name}</span>
					<select
						class="source__select"
						aria-label="the soundfont's preset"
						value={bench.soundFontPreset}
						onchange={(event) => {
							stopBeat();
							bench.openSoundFont(font, Number(event.currentTarget.value));
							chase();
						}}
					>
						{#each font.presets as preset (preset.index)}
							<option value={preset.index}
								>{preset.bank}:{preset.program} {preset.name}{preset.drum ? ' (kit)' : ''}</option
							>
						{/each}
					</select>
				{/if}
				{#if bench.mode === 'drum'}
					<span class="source__label">make a kit</span>
					<div class="source__row">
						{#each KIT_STYLES as style (style)}
							<Button
								size="sm"
								variant="ghost"
								onclick={() => (stopBeat(), bench.generate(style), chase())}>{style}</Button
							>
						{/each}
					</div>
					<div class="source__row">
						<Button
							size="sm"
							onclick={() => (stopBeat(), bench.randomize(), chase(), (page = 'voice'))}
							>randomize</Button
						>
						<Button size="sm" onclick={() => (bench.mutate(), chase())}>mutate</Button>
						{#if current}
							<select
								class="source__select"
								aria-label="what this sound is"
								value={current.kind ?? 'perc'}
								onchange={(event) =>
									current &&
									bench.setKind(
										current.id,
										event.currentTarget.value as (typeof DRUM_KINDS)[number]
									)}
							>
								{#each DRUM_KINDS as kind (kind)}
									<option value={kind}>{kind}</option>
								{/each}
							</select>
						{/if}
					</div>
				{:else if bench.mode === 'slices'}
					<span class="source__label">cut the loop</span>
					<div class="source__row">
						{#each CUTS as option (option.id)}
							<Button
								size="sm"
								pressed={bench.cut === option.id}
								onclick={() => ((bench.cut = option.id), bench.recut())}>{option.label}</Button
							>
						{/each}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => (shuffle = shuffle ? 0 : Math.floor(Math.random() * 1e5) + 1)}
							>{shuffle ? 'in order' : 'shuffle'}</Button
						>
					</div>
				{:else}
					<span class="source__label">keyboard</span>
					<div class="source__row">
						<Button size="sm" onclick={() => (bench.octave = Math.max(-3, bench.octave - 1))}
							>−</Button
						>
						<span class="source__octave">octave {signed(bench.octave)}</span>
						<Button size="sm" onclick={() => (bench.octave = Math.min(3, bench.octave + 1))}
							>+</Button
						>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<KeyBench
		{bench}
		{lit}
		{receiving}
		onpress={press}
		onrelease={release}
		onfiles={(key, files) =>
			void addDropped(
				files.map((file) => ({ file, path: file.name })),
				key
			)}
	/>

	<footer class="strip">
		<div class="strip__beat">
			<Button size="sm" pressed={beat} onclick={toggleBeat} disabled={bench.sounds.length === 0}
				>{beat ? 'stop' : 'play'}</Button
			>
			{#if bench.mode === 'drum'}
				{#each GROOVES as g (g)}
					<Button size="sm" variant="ghost" pressed={groove === g} onclick={() => setGroove(g)}
						>{g}</Button
					>
				{/each}
			{:else if instrument}
				{#each MELODIES as m (m)}
					<Button size="sm" variant="ghost" pressed={melody === m} onclick={() => (melody = m)}
						>{m}</Button
					>
				{/each}
			{/if}
			{#if bench.mode !== 'slices'}
				<span class="strip__bpm">
					<button
						type="button"
						class="strip__step"
						aria-label="slower"
						onclick={() => (bpm = Math.max(60, bpm - 2))}>−</button
					>
					<span class="strip__value">{bpm}</span>
					<button
						type="button"
						class="strip__step"
						aria-label="faster"
						onclick={() => (bpm = Math.min(200, bpm + 2))}>+</button
					>
					<span class="strip__unit">bpm</span>
				</span>
			{/if}
		</div>

		<div class="strip__limits" aria-label="what the device takes">
			<span class="cell"
				><Led state={bench.sounds.length > 0 ? 'white' : 'off'} size="sm" />{keysUsed}</span
			>
			<span class="cell" {@attach tooltip('the longest sound; the device takes 20 s')}>
				<Led
					state={bench.stats.longest > 20 ? 'dim' : bench.stats.longest > 0 ? 'white' : 'off'}
					size="sm"
				/>
				{bench.stats.longest.toFixed(2)} s <span class="cell__of">/ 20 s</span>
			</span>
			<span class="cell" {@attach tooltip('the preset’s size; a project loads 64 MB of samples')}>
				<Led
					state={bench.stats.bytes > 32 * 1024 * 1024
						? 'dim'
						: bench.sounds.length > 0
							? 'white'
							: 'off'}
					size="sm"
				/>
				{megabytes(bench.sounds.length > 0 ? bench.stats.bytes : 0)}
				<span class="cell__of">/ 64 MB</span>
			</span>
			{#each [...errors, ...warnings] as problem (problem.text)}
				<span class={['problem', problem.level === 'error' && 'is-error']}>{problem.text}</span>
			{/each}
			{#if exported && errors.length === 0}
				<span class="problem is-done">{exported} downloaded</span>
			{/if}
		</div>

		<div class="strip__more">
			{#if (bench.mode === 'drum' || bench.mode === 'slices') && bench.sounds.length > 0}
				<Button size="sm" variant="ghost" onclick={toReplica}>open on the replica</Button>
			{/if}
			{#if bench.canUndo}
				<span {@attach tooltip('undo the last change (⌘Z)')}>
					<Button size="sm" variant="ghost" onclick={() => (stopBeat(), bench.undo())}>undo</Button>
				</span>
			{/if}
			{#if !bench.empty}
				<Button size="sm" variant="ghost" onclick={() => (stopBeat(), bench.clear())}>clear</Button>
			{/if}
			<span {@attach tooltip(recordTip)}>
				<Button size="sm" led={recording ? 'red' : 'off'} pressed={recording} onclick={toggleRecord}
					>{recording ? 'stop rec' : 'rec'}</Button
				>
			</span>
			<Button size="sm" variant="ghost" onclick={choose}>add files</Button>
		</div>
	</footer>

	{#if receiving}
		<div class="veil" aria-hidden="true">
			<span>drop anywhere to place them, or on a key to put them there</span>
		</div>
	{/if}
</div>

<Legend as="p" size="xs" tone="subtle" class="maker__note">
	Samples are written the way the device writes them: 16-bit WAV at 44.1 kHz with the root note
	inside, at most 20 s each. Unzip the download into a folder of your own under presets on the
	device (in MTP mode: com, then M4), or install it over USB. Nothing leaves this browser.
</Legend>

<style>
	.maker {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 0.875rem 1rem 0.75rem;
		border-radius: 1rem;
		background: linear-gradient(to bottom, #222326, #1e1f22 45%, #1b1c1f);
		color: var(--xy-mat-legend);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.12),
			inset 0 -1px 0 rgb(255 255 255 / 0.05),
			0 0 0 1px #0b0c0e,
			0 1.5rem 3rem -1.5rem rgb(0 0 0 / 0.6);
		--xy-fg: var(--xy-mat-legend);
		--xy-fg-muted: #b9b8b5;
		--xy-fg-subtle: #909195;
		--xy-fg-faint: #6c6e73;
	}

	.bar {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
	}

	.bar__modes,
	.bar__actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.bar__actions {
		gap: 0.625rem;
		margin-left: auto;
	}

	.name {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.5rem;
		min-width: 16rem;
		max-width: 30rem;
		height: 2rem;
		padding: 0 0.625rem;
		border-radius: var(--xy-radius-tile);
		background-color: #000000;
		box-shadow:
			inset 0 1px 2px rgb(0 0 0 / 0.6),
			0 0 0 1px rgb(255 255 255 / 0.06);
	}

	.name__label {
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-2xs);
	}

	.name__input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--xy-scr-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
		outline: none;
	}

	.name__input::placeholder {
		color: var(--xy-ramp-4);
	}

	.name:focus-within {
		box-shadow:
			inset 0 1px 2px rgb(0 0 0 / 0.6),
			0 0 0 1.5px var(--xy-focus);
	}

	.name__folder {
		overflow: hidden;
		max-width: 11rem;
		color: var(--xy-ramp-4);
		font-size: var(--xy-text-2xs);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.install {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: var(--xy-z-overlay);
		width: 22rem;
		padding: 0.875rem 1rem;
		border-radius: var(--xy-radius-tile);
		background-color: #141517;
		box-shadow: var(--xy-shadow-float);
		animation: rise var(--xy-dur-base) var(--xy-ease-standard);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(-0.25rem);
		}
	}

	.deck {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 19.5rem;
		gap: 1rem;
		align-items: stretch;
	}

	.deck__screen {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.deck__screen > :global(.screen) {
		flex: 1;
	}

	/* a take running: the device's live red, over the glass's corner */
	.live {
		position: absolute;
		top: 0.75rem;
		right: 0.875rem;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.1875rem 0.5rem;
		border-radius: var(--xy-radius-card);
		background-color: #000000;
		color: var(--xy-scr-fg);
		font-size: var(--xy-text-xs);
		font-variant-numeric: tabular-nums;
		box-shadow: 0 0 0 1px rgb(255 77 0 / 0.45);
		animation: rise var(--xy-dur-base) var(--xy-ease-standard);
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.25rem 0 0;
	}

	.encoders {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem;
	}

	.pages,
	.source__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3125rem;
	}

	.source {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-top: auto;
		padding-top: 0.625rem;
		border-top: 1px solid rgb(0 0 0 / 0.55);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.035);
	}

	.source__label {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
	}

	.source__select {
		height: 2rem;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background-color: #000000;
		color: var(--xy-scr-fg);
		font: inherit;
		font-size: var(--xy-text-xs);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.08);
	}

	.source__octave {
		min-width: 4.5rem;
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.strip {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgb(0 0 0 / 0.55);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.035);
	}

	.strip__beat,
	.strip__more,
	.strip__limits {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}

	.strip__limits {
		gap: 1rem;
		overflow: hidden;
		font-size: var(--xy-text-xs);
		white-space: nowrap;
	}

	.strip__bpm {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: 0.375rem;
		font-size: var(--xy-text-xs);
		font-variant-numeric: tabular-nums;
	}

	.strip__step {
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background-color: var(--xy-mat-tile);
		color: var(--xy-fg);
		font: inherit;
		cursor: pointer;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.08),
			0 0 0 1px rgb(0 0 0 / 0.5);
	}

	.strip__step:hover {
		background-color: #2c2d31;
	}

	.strip__value {
		min-width: 1.75rem;
		text-align: center;
	}

	.strip__unit,
	.cell__of {
		color: var(--xy-fg-subtle);
	}

	.cell {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-variant-numeric: tabular-nums;
	}

	.problem {
		overflow: hidden;
		color: var(--xy-fg-muted);
		text-overflow: ellipsis;
	}

	.problem.is-error {
		color: var(--xy-fg);
	}

	.problem.is-error::before {
		content: '';
		display: inline-block;
		width: 0.375rem;
		height: 0.375rem;
		margin-right: 0.375rem;
		border-radius: 50%;
		background-color: var(--xy-led-red);
		box-shadow: var(--xy-glow-red);
		vertical-align: 0.05em;
	}

	.problem.is-done {
		color: var(--xy-fg-subtle);
	}

	.welcome {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 1rem 1rem;
	}

	.welcome__title {
		margin: 0;
		font-size: var(--xy-text-3xl);
		font-weight: var(--xy-weight-thin);
		line-height: var(--xy-leading-3xl);
		letter-spacing: var(--xy-tracking-display);
	}

	.welcome__text {
		max-width: 36rem;
		margin: 0;
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.welcome__reading {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--xy-scr-fg);
		font-size: var(--xy-text-sm);
	}

	.welcome__keys {
		margin: 0;
		color: var(--xy-ramp-4);
		font-size: var(--xy-text-xs);
	}

	.welcome__keys kbd {
		display: inline-block;
		min-width: 1.125rem;
		padding: 0 0.25rem;
		border-radius: 0.1875rem;
		background-color: var(--xy-mat-tile);
		color: var(--xy-mat-legend);
		font: inherit;
		text-align: center;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.08),
			0 0 0 1px rgb(255 255 255 / 0.06);
	}

	.welcome__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.25rem;
	}

	.welcome__or {
		margin: 0 0.25rem 0 0.75rem;
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-xs);
	}

	/* files over the page: the whole workbench takes them, the keys show they do too */
	.veil {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 1.25rem;
		border-radius: inherit;
		box-shadow: inset 0 0 0 1.5px rgb(247 245 245 / 0.5);
		pointer-events: none;
		animation: veil-in var(--xy-dur-base) var(--xy-ease-standard);
	}

	.veil span {
		padding: 0.25rem 0.625rem;
		border-radius: var(--xy-radius-card);
		background-color: #000000;
		color: var(--xy-scr-fg);
		font-size: var(--xy-text-xs);
	}

	@keyframes veil-in {
		from {
			opacity: 0;
		}
	}

	:global(.maker__note) {
		max-width: 60rem;
		margin: 0.75rem 0.25rem 0;
	}
</style>
