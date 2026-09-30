/**
 * The eval's ears, the browser half (headless Chromium, driven by `render/index.ts`): renders what
 * the replica plays from a simulator state through the app's own sound (`$lib/sound/offline`, which
 * the lab's listening uses too), with the audio of the agent's own made kits, and hands back the
 * master bus, which is where the app's listening taps the replica.
 */
import { renderOffline } from '$lib/sound/offline';
import { SampleRegistry } from '$lib/sound/samples';
import { fromBase64, toBase64, type RenderReply, type RenderRequest } from './protocol';

async function render(request: RenderRequest): Promise<RenderReply> {
	const samples = new SampleRegistry();
	for (const file of request.files) {
		samples.setFile(file.id, {
			sampleRate: file.sampleRate,
			channels: file.channels.map(fromBase64)
		});
	}
	const audio = await renderOffline(request, samples);
	return { sampleRate: audio.sampleRate, channels: audio.channels.map(toBase64) };
}

declare global {
	interface Window {
		renderReplica?: typeof render;
	}
}

window.renderReplica = render;
