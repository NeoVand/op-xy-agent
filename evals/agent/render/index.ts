/**
 * The eval's ears: listening for the agent in Node that hears the replica as the app does. A
 * headless Chromium page (`page.ts`, served by the eval's own Vite server) renders the simulator's
 * state through the app's sound; the analysis is the app's (`core/listen`), run here. So `listen`
 * and `listen_tracks` measure what the agent really made — its patterns, its kits, its sound
 * changes, the metronome — instead of failing for want of audio.
 *
 * A recording takes as long as it lasts, as in the app, so the eval's timings stay honest; the lab's
 * renders (`renderer`) come back as soon as they are made, as they do in the app.
 */
import { chromium, type Page } from 'playwright';
import type { LabRenderer } from '$lib/agent/lab/core';
import type { ListenHost, ListenRecording } from '$lib/agent/listen-host';
import { analyzeAudio } from '$lib/core/listen';
import { snapshot } from '$lib/sim/areas/system/projects';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SampleData } from '$lib/sound/samples';
import { fromBase64, toBase64, type RenderReply, type RenderRequest } from './protocol';

/** A browser's usual rate (the app's AudioContext takes the output device's). */
const SAMPLE_RATE = 48_000;
/** The page's address on the eval's server (answered by the browser itself, never the server). */
const PAGE = '/__eval-ears';
const HTML =
	'<!doctype html><meta charset="utf-8"><title>ears</title><script type="module" src="/evals/agent/render/page.ts"></script>';

/** Listening for the eval's environments, over one browser page. */
export interface Ears {
	/** Listening for one environment: its simulator, and the audio of the files its agent made. */
	host(sim: OpxySim, files: ReadonlyMap<string, SampleData>): ListenHost;
	/** Rendering for the lab's listening, as fast as the page renders (no real-time wait). */
	renderer(files: ReadonlyMap<string, SampleData>): LabRenderer;
	close(): Promise<void>;
}

type RenderWindow = { renderReplica(request: RenderRequest): Promise<RenderReply> };

/** Opens the page on `baseUrl` (the eval's Vite server) and waits until it can render. */
export async function openEars(baseUrl: string): Promise<Ears> {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route(`${baseUrl}${PAGE}`, (route) =>
			route.fulfill({ contentType: 'text/html', body: HTML })
		);
		await page.goto(`${baseUrl}${PAGE}`);
		await page
			.waitForFunction(() => 'renderReplica' in window, null, { timeout: 120_000 })
			.catch(() => {
				throw new Error(`the ears' page did not load${errors.length ? `: ${errors[0]}` : ''}`);
			});
		return {
			host: (sim, files) => listenHost(page, sim, files),
			renderer: (files) => labRenderer(page, files),
			close: () => browser.close()
		};
	} catch (error) {
		await browser.close();
		throw error;
	}
}

/** Sample files' audio as the page takes it. */
const encoded = (files: ReadonlyMap<string, SampleData>) =>
	[...files].map(([id, audio]) => ({
		id,
		sampleRate: audio.sampleRate,
		channels: audio.channels.map(toBase64)
	}));

function labRenderer(page: Page, files: ReadonlyMap<string, SampleData>): LabRenderer {
	return {
		async render(render) {
			const request: RenderRequest = { ...render, sampleRate: SAMPLE_RATE, files: encoded(files) };
			const reply = await page.evaluate(
				(r) => (window as unknown as RenderWindow).renderReplica(r),
				request
			);
			return { sampleRate: reply.sampleRate, channels: reply.channels.map(fromBase64) };
		}
	};
}

function listenHost(page: Page, sim: OpxySim, files: ReadonlyMap<string, SampleData>): ListenHost {
	return {
		async record(source, seconds, signal): Promise<ListenRecording> {
			if (source !== 'replica') throw new Error('No OP-XY is connected here.');
			const started = Date.now();
			const s = sim.state;
			const request: RenderRequest = {
				project: snapshot(s),
				transport: { ...s.transport },
				track: s.track,
				mode: s.mode,
				seconds,
				sampleRate: SAMPLE_RATE,
				files: encoded(files)
			};
			const reply = await page.evaluate(
				(r) => (window as unknown as RenderWindow).renderReplica(r),
				request
			);
			const rest = seconds * 1000 - (Date.now() - started);
			if (rest > 0) await wait(rest, signal);
			if (signal.aborted) throw new Error('Listening was stopped.');
			return {
				channels: reply.channels.map(fromBase64),
				sampleRate: reply.sampleRate,
				source: 'replica',
				label: 'replica'
			};
		},
		async analyze(recording, options) {
			return analyzeAudio(recording.channels, recording.sampleRate, options);
		}
	};
}

const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
