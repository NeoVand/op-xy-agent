/**
 * `make_kit`: a drum kit from the agent's description, rendered by deterministic code
 * (`core/presets/generate.ts`) and left in the preset maker, where the user plays, changes, downloads
 * or installs it; with a track, also put on that track of the replica, so the agent can program a
 * beat on it and play it at once. The model describes each sound as typed parameters; it never
 * writes audio.
 */
import { z } from 'zod';
import {
	DRUM_FIRST_KEY,
	DRUM_KEYS,
	KIT_STYLES,
	MAX_DECAY,
	VOICE_TYPES,
	generateKit,
	renderVoice,
	type SampleInput
} from '$lib/core/presets';
import { defineTool, errorResult, jsonResult, type PresetInboxHost } from './define';
import type { VirtualOpxy } from '../virtual-opxy';

const unit = z.number().min(0).max(1).optional();

export const makeKitTool = defineTool({
	name: 'make_kit',
	label: 'make a kit',
	kind: 'ui',
	// a list of voices with a dozen fields each would push the strict tool set's grammar over the
	// API's size limit; zod still checks every call
	strict: false,
	description: `Make a drum kit from generated sounds and leave it in the app's preset maker, where the user can play each key, swap in their own samples, download the .preset or install it on the OP-XY over USB. Give track (1–8) to also put it on that track of the replica: the track becomes a drum sampler playing the kit, so you can write_pattern a beat there and play it right away (do this whenever the user wants to hear or use the kit). Start from a style (808: long boomy kick; 909: punchy; lo-fi: crushed; tight: short and snappy; boom: huge kick) or none, then give voices to put on keys 53–76 (F3–E5; the factory order is kick 53–54, snare 55–56, rim 57, clap 58, tambourine 59, shaker 60, closed hats 61–62, open hat 63, clave 64, low tom 65, ride 66, mid tom 67, crash 68, high tom 69, triangle 70, congas 71–72, cowbell 73, guiro 74, metal 75, fx 76). Voice types: ${VOICE_TYPES.join(', ')}. Leave out the numbers you do not care about: pitch in Hz (kick 30–90, toms and congas 60–400, snare 120–300), decay in seconds (0.01–${MAX_DECAY}), and 0–1 for tone (dark to bright), snap (kick click, snare wires), drive (saturation) and crush (lo-fi). Up to ${DRUM_KEYS} voices; a voice replaces the style's sound on its key. With a style, a kit is whole: on a track it replaces every key's sound. With voices alone, only their keys change on the track and the rest keep their sounds, so one generated sound is remade by giving its voice alone with its new values (a longer, lower kick: the kick voice with more decay, a lower pitch); the preset maker then holds just those voices. To trim a sound the track has (a shorter snare), set that key's own values with the key planner instead (its "end", "tune", "gain" with key naming the key). Tell the user the kit is in the preset maker, with the link the result gives, and on which track of the replica it plays. from_preset_maker puts the kit the user made in the preset maker (the drum kit it held when they left it, edits and all) on track instead of making one; the preset maker's own "open on the replica" puts it on track 1.`,
	input: z.object({
		name: z
			.string()
			.min(1)
			.max(24)
			.describe(
				'The kit’s name, as the device will list it (a kit from the preset maker keeps its own)'
			),
		track: z
			.number()
			.int()
			.min(1)
			.max(8)
			.optional()
			.describe(
				'Also put the kit on this instrument track of the replica (it becomes a drum sampler)'
			),
		from_preset_maker: z
			.boolean()
			.optional()
			.describe(
				'Put the user’s own kit from the preset maker on track instead of making one (style and voices are then left out)'
			),
		style: z.enum(KIT_STYLES).optional().describe('A whole kit to start from'),
		voices: z
			.array(
				z.object({
					key: z
						.number()
						.int()
						.min(DRUM_FIRST_KEY)
						.max(DRUM_FIRST_KEY + DRUM_KEYS - 1),
					type: z.enum(VOICE_TYPES),
					pitch: z.number().min(20).max(2000).optional(),
					decay: z.number().min(0.01).max(MAX_DECAY).optional(),
					tone: unit,
					snap: unit,
					drive: unit,
					crush: unit
				})
			)
			.max(DRUM_KEYS)
			.default([])
	}),
	async run({ name, style, voices, track, from_preset_maker }, ctx) {
		const inbox = ctx.env.presets;
		const virtual = ctx.env.virtual ?? null;
		if (from_preset_maker) return fromPresetMaker(inbox, virtual, track);
		if (!inbox && !(track && virtual)) {
			return errorResult('The preset maker is not available here.', 'no preset maker');
		}
		if (!style && voices.length === 0) {
			return errorResult('Give a style or at least one voice.', 'nothing to make');
		}
		const byKey = new Map<number, SampleInput>();
		for (const sample of style ? generateKit(style) : []) byKey.set(sample.key as number, sample);
		// voices alone remake keys of the kit a track has: each keeps the name its key had when it is
		// the same kind of sound ("808 snare" stays "808 snare"), so grids that name it still find it
		// (an agent was unsure whether its pattern followed a snare renamed "snare")
		const had = !style && track && virtual ? (virtual.readSound(track).kit ?? {}) : {};
		for (const [i, v] of voices.entries()) {
			// the voice travels with its sound, so the preset maker's knobs can turn it
			const { key, ...rest } = v;
			const voice = { ...rest, seed: i + 1 };
			const old = had[noteName(key)];
			const name = old && old.toLowerCase().includes(v.type) ? old : v.type;
			byKey.set(key, { name, audio: renderVoice(voice), key, voice });
		}
		const samples = [...byKey.values()].sort((a, b) => (a.key as number) - (b.key as number));
		inbox?.put({ name, samples });
		let loaded: {
			track: number;
			keys: number;
			engine_changed: boolean;
			audible: boolean;
			sounds?: Readonly<Record<string, string>>;
		} | null = null;
		if (track && virtual) {
			try {
				const load = virtual.loadKit(track, {
					name,
					sounds: samples.map((s) => ({ key: s.key as number, name: s.name, audio: s.audio }))
				});
				loaded = {
					track: load.track,
					keys: load.keys,
					engine_changed: load.engineChanged,
					audible: load.audible,
					// each key's sound by name: write_pattern's grid takes these names (an agent wrote
					// "kick 1", the new project's name, onto a made kit's "kick")
					sounds: virtual.readSound(load.track).kit
				};
			} catch (error) {
				return errorResult(
					`The kit was made${inbox ? ' and is in the preset maker' : ''}, but it could not go on track ${track}: ${error instanceof Error ? error.message : String(error)}`,
					'not on the replica'
				);
			}
		}
		return jsonResult(
			{
				kit: name,
				keys: samples.length,
				...(inbox ? { preset_maker: inbox.href } : {}),
				...(loaded ? { on_replica: loaded } : {}),
				note: loaded
					? `On the replica's track ${loaded.track} now${loaded.engine_changed ? ' (it was another engine; it is a drum sampler now)' : ''}: write a pattern there and play it.${loaded.audible ? '' : ' This browser cannot make sound, so the kit is silent here.'} It also waits in the preset maker to download or install.`
					: 'The kit waits in the preset maker: link the user there to play, download or install it.'
			},
			loaded
				? `${name}: ${samples.length} sounds on track ${loaded.track} and in the preset maker`
				: `${name}: ${samples.length} sounds in the preset maker`
		);
	}
});

export const PRESET_TOOLS = [makeKitTool] as const;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** A MIDI note as the kit lists keys: 55 is "G3". */
const noteName = (note: number) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

/** The user's kit from the preset maker, onto a replica track. */
function fromPresetMaker(
	inbox: PresetInboxHost | null | undefined,
	virtual: VirtualOpxy | null,
	track: number | undefined
) {
	if (!virtual) return errorResult('There is no replica here.', 'no replica');
	if (!track) return errorResult('Give the track (1–8) the kit goes on.', 'no track');
	const kit = inbox?.keptKit?.() ?? null;
	if (!kit) {
		// which of the two, said plainly (an agent could only guess and told the user both)
		const why = inbox?.opened?.()
			? 'it held no drum kit when the user left it (it was empty, or on a sampler or multisample preset, which a replica drum track does not take)'
			: 'it has not been opened since the app loaded (it keeps nothing across a reload)';
		return errorResult(
			`The preset maker has no drum kit to give: ${why}. The user can open it${inbox ? ` (${inbox.href})` : ''}, make or drop a kit and come back here; its own "open on the replica" puts the kit on track 1 instead, replacing that track's sounds.`,
			'no kit in the preset maker'
		);
	}
	try {
		const load = virtual.loadKit(track, { name: kit.name, sounds: kit.sounds });
		return jsonResult(
			{
				kit: kit.name,
				keys: load.keys,
				on_replica: {
					track: load.track,
					engine_changed: load.engineChanged,
					audible: load.audible,
					sounds: virtual.readSound(load.track).kit
				},
				note: `The user's kit from the preset maker is on the replica's track ${load.track} now${load.engineChanged ? ' (it was another engine; it is a drum sampler now)' : ''}: write a pattern there and play it.${load.audible ? '' : ' This browser cannot make sound, so the kit is silent here.'}`
			},
			`${kit.name} on track ${load.track}`,
			{ applied: true }
		);
	} catch (error) {
		return errorResult(
			`The kit could not go on track ${track}: ${error instanceof Error ? error.message : String(error)}`,
			'not on the replica'
		);
	}
}
