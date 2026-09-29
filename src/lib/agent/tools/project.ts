/**
 * `send_project`: the replica's project (its patterns, scenes and songs) added to the user's OP-XY
 * as a new project, over USB (MTP), through the app's own project transfer
 * (`$lib/app/project-transfer.svelte.ts`). The OP-XY must be in MTP mode (`com → M4`), which drops
 * its MIDI connection until the transfer ends. The user approves every send in the app; the file
 * only ever adds a project, never replaces one, and is written over the project the device has open,
 * so the device's own sounds stay.
 */
import { z } from 'zod';
import { defineTool, errorResult, jsonResult } from './define';

/** A project name the OP-XY takes: lowercase letters, digits, spaces and `#()-_`, at most 24. */
const PROJECT_NAME = /^[a-z0-9][a-z0-9 #()_-]{0,23}$/;

export const sendProjectTool = defineTool({
	name: 'send_project',
	label: 'send project',
	kind: 'mutate',
	description:
		"Add the replica's project (its patterns, scenes and songs) to the user's OP-XY as a new project in projects/user, over USB, when they want what you made on their device (\"put it on my op-xy\"). The OP-XY must be in MTP mode first: ask the user to press com → M4 (its MIDI connection drops until the transfer ends) and wait for them to say it is, then call this; the user approves in the app, and Chrome may ask which device. It never replaces a project: give a new name, lowercase letters, digits and spaces, at most 24. The device's own sounds stay (the file is written over the project it has open). Afterwards tell them how to open it on the OP-XY, from the manual.",
	input: z.object({
		name: z
			.string()
			.min(1)
			.max(24)
			.describe('The new project name: lowercase letters, digits, spaces, # ( ) - _')
	}),
	preview(input) {
		return {
			label: `add "${input.name}" to the op-xy's projects`,
			before: null,
			after: `projects/user/${input.name}.xy`,
			note: 'the OP-XY must be in MTP mode (com → M4); Chrome may ask which device'
		};
	},
	async run(input, ctx) {
		const projects = ctx.env.projects;
		if (!projects) return errorResult('Projects cannot be sent from here.', 'not available');
		if (!projects.usb) {
			return errorResult(
				'This browser cannot reach USB devices (WebUSB): the user can download the project as a .xy file from the project key under the replica instead.',
				'no usb here'
			);
		}
		const name = input.name.trim().toLowerCase();
		if (!PROJECT_NAME.test(name)) {
			return errorResult(
				`"${input.name}" is not a name the OP-XY takes: lowercase letters, digits, spaces and # ( ) - _, at most 24.`,
				'bad name'
			);
		}
		const result = await projects.saveToDevice(name);
		if ('error' in result) {
			return errorResult(
				`Not sent: ${result.error}. If no OP-XY was offered, it is probably not in MTP mode (com → M4) yet.`,
				'not sent'
			);
		}
		return jsonResult(
			{
				saved: result.path,
				...(result.skipped.length ? { notCarried: result.skipped } : {}),
				note: 'It is on the OP-XY now, in its projects folder (user). It carries the patterns, scenes, songs, tempo and groove; the tracks keep the sounds, mixer levels and players the OP-XY had open, so they can sound different from the replica. The device leaves MTP mode by itself once the transfer ends.'
			},
			`sent to ${result.path}`,
			{ applied: true }
		);
	}
});

/** The project tools. */
export const PROJECT_TOOLS = [sendProjectTool];
