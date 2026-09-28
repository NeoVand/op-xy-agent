/**
 * `make_kit`: a drum kit from the agent's description, rendered by deterministic code
 * (`core/presets/generate.ts`) and left in the preset maker, where the user plays, changes, downloads
 * or installs it. The model describes each sound as typed parameters; it never writes audio.
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
import { defineTool, errorResult, jsonResult } from './define';

const unit = z.number().min(0).max(1).optional();

export const makeKitTool = defineTool({
	name: 'make_kit',
	label: 'make a kit',
	kind: 'ui',
	// a list of voices with a dozen fields each would push the strict tool set's grammar over the
	// API's size limit; zod still checks every call
	strict: false,
	description: `Make a drum kit from generated sounds and leave it in the app's preset maker, where the user can play each key, swap in their own samples, download the .preset or install it on the OP-XY over USB. Start from a style (808: long boomy kick; 909: punchy; lo-fi: crushed; tight: short and snappy; boom: huge kick) or none, then give voices to put on keys 53–76 (F3–E5; the factory order is kick 53–54, snare 55–56, rim 57, clap 58, tambourine 59, shaker 60, closed hats 61–62, open hat 63, clave 64, low tom 65, ride 66, mid tom 67, crash 68, high tom 69, triangle 70, congas 71–72, cowbell 73, guiro 74, metal 75, fx 76). Voice types: ${VOICE_TYPES.join(', ')}. Leave out the numbers you do not care about: pitch in Hz (kick 30–90, toms and congas 60–400, snare 120–300), decay in seconds (0.01–${MAX_DECAY}), and 0–1 for tone (dark to bright), snap (kick click, snare wires), drive (saturation) and crush (lo-fi). Up to ${DRUM_KEYS} voices; a voice replaces the style's sound on its key. Tell the user the kit is in the preset maker, with the link the result gives.`,
	input: z.object({
		name: z.string().min(1).max(24).describe('The kit’s name, as the device will list it'),
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
	}),
	async run({ name, style, voices }, ctx) {
		const inbox = ctx.env.presets;
		if (!inbox) return errorResult('The preset maker is not available here.', 'no preset maker');
		if (!style && voices.length === 0) {
			return errorResult('Give a style or at least one voice.', 'nothing to make');
		}
		const byKey = new Map<number, SampleInput>();
		for (const sample of style ? generateKit(style) : []) byKey.set(sample.key as number, sample);
		for (const [i, v] of voices.entries()) {
			const audio = renderVoice({ ...v, seed: i + 1 });
			byKey.set(v.key, { name: v.type, audio, key: v.key });
		}
		const samples = [...byKey.values()].sort((a, b) => (a.key as number) - (b.key as number));
		inbox.put({ name, samples });
		return jsonResult(
			{
				kit: name,
				keys: samples.length,
				preset_maker: inbox.href,
				note: 'The kit waits in the preset maker: link the user there to play, download or install it.'
			},
			`${name}: ${samples.length} sounds in the preset maker`
		);
	}
});

export const PRESET_TOOLS = [makeKitTool] as const;
