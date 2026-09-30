/**
 * What the eval's ears (`render/index.ts`, in Node) and their page (`render/page.ts`, in headless
 * Chromium) pass each other: the simulator's project and playback going in, the replica's master
 * bus coming back. Audio travels as base64 of little-endian float32, which is far quicker to hand
 * across than arrays of numbers.
 */
import type { OfflineRender } from '$lib/sound/offline';

/** Renders what the replica plays from this state, for `seconds` (`$lib/sound/offline`). */
export interface RenderRequest extends OfflineRender {
	/** The audio of sample files the agent made (a kit's sounds), by file id. */
	readonly files: readonly RenderFile[];
}

/** A sample file's audio. */
export interface RenderFile {
	readonly id: string;
	readonly sampleRate: number;
	readonly channels: readonly string[];
}

/** The master bus, as the app's listening taps it (before the volume knob). */
export interface RenderReply {
	readonly sampleRate: number;
	readonly channels: readonly string[];
}

/** Float32 samples as base64 (Node and browsers both have btoa). */
export function toBase64(data: Float32Array): string {
	const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/** Base64 back to float32 samples. */
export function fromBase64(text: string): Float32Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Float32Array(bytes.buffer);
}
