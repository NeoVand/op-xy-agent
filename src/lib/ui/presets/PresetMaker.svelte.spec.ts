// The preset maker in a real browser: a generated kit fills the 24 keys, dropped files land where
// TE's factory kits keep their kind (by name, else by ear), a dropped loop is sliced, and a key
// press selects its sound for the screen and the encoders. All audio is synthesized here.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { encodeWav, renderVoice, type Voice } from '$lib/core/presets';
import PresetMaker from './PresetMaker.svelte';

const wav = (name: string, voice: Voice) =>
	new File([encodeWav(renderVoice(voice)) as Uint8Array<ArrayBuffer>], name, { type: 'audio/wav' });

/** Drops files on the workbench as the browser would. */
function drop(files: File[], target: Element) {
	const data = new DataTransfer();
	for (const file of files) data.items.add(file);
	target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: data }));
	target.dispatchEvent(
		new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })
	);
}

const labels = () =>
	Array.from(document.querySelectorAll('.tile.has-sound'), (t) => t.getAttribute('aria-label'));

/** The screen's message line (it may be clipped on a small viewport, so read, not seen). */
const message = () => document.querySelector('.screen__message')?.textContent ?? '';

describe('the preset maker', () => {
	it('starts empty, and a generated kit fills every key', async () => {
		render(PresetMaker);
		await expect.element(page.getByText('drop sounds anywhere')).toBeVisible();
		await page.getByRole('button', { name: '909', exact: true }).first().click();
		await expect.poll(() => labels().length).toBe(24);
		expect(labels()[0]).toBe('f3: kick, kick');
		await expect.element(page.getByRole('textbox')).toHaveValue('909 kit');
		await expect.element(page.getByText('909 kit.preset')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'download .preset' })).not.toBeDisabled();
		// clearing is one undo away
		await page.getByRole('button', { name: 'clear', exact: true }).click();
		await expect.poll(() => labels().length).toBe(0);
		await page.getByRole('button', { name: 'undo', exact: true }).click();
		await expect.poll(() => labels().length).toBe(24);
	});

	it('puts dropped hits on TE’s layout, by name and by ear', async () => {
		render(PresetMaker);
		const maker = document.querySelector('.maker') as Element;
		drop(
			[
				wav('take 1.wav', { type: 'closed hat' }),
				wav('BD_01.wav', { type: 'kick' }),
				wav('take 2.wav', { type: 'snare' }),
				wav('CP 909.wav', { type: 'clap' })
			],
			maker
		);
		await expect.poll(() => labels().length).toBe(4);
		expect(labels()).toEqual([
			'f3: BD_01, kick',
			'g3: take 2, snare',
			'a#3: CP 909, clap',
			'c#4: take 1, closed hat'
		]);
		await expect.poll(message).toMatch(/4 sounds placed as TE lays out a kit/);
	});

	it('puts a file dropped on a key right there, and swaps keys dragged onto each other', async () => {
		render(PresetMaker);
		const key = document.querySelector('.tile[data-note="70"]') as Element;
		drop([wav('kick.wav', { type: 'kick' })], key);
		await expect.poll(() => labels()).toEqual(['a#4: kick, kick']);
	});

	it('slices a dropped loop at its hits', async () => {
		render(PresetMaker);
		const x = new Float32Array(4 * 44100);
		const hit = renderVoice({ type: 'kick', decay: 0.2 }).channels[0];
		for (let beat = 0; beat < 8; beat++) {
			const at = Math.round(beat * 0.5 * 44100);
			for (let i = 0; i < hit.length && at + i < x.length; i++) x[at + i] += 0.8 * hit[i];
		}
		const loop = new File(
			[encodeWav({ sampleRate: 44100, channels: [x] }) as Uint8Array<ArrayBuffer>],
			'beat.wav'
		);
		drop([loop], document.querySelector('.maker') as Element);
		await expect.poll(message).toMatch(/beat: 8 slices, 120 bpm/);
		expect(labels()).toHaveLength(8);
		await expect
			.element(page.getByRole('button', { name: 'slices', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('selects a key’s sound for the screen and its encoders when pressed', async () => {
		render(PresetMaker);
		await page.getByRole('button', { name: 'tight', exact: true }).first().click();
		await expect.poll(() => labels().length).toBe(24);
		await page.getByRole('button', { name: /^g3: snare/ }).click();
		await expect
			.element(page.getByRole('button', { name: /^g3: snare/ }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('slider', { name: 'start', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'tone', exact: true }).click();
		const level = page.getByRole('slider', { name: 'level', exact: true });
		await level.click();
		(document.activeElement as HTMLElement).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
		);
		await expect.element(level).toHaveAttribute('aria-valuenow', '1');
	});
});
