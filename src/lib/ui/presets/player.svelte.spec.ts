// The preview player rendered offline in a real browser: a key sounds, at its level and pitch,
// once for a one-shot, looping for a sampler until it is let go, and a mute group cuts itself off.
import { describe, expect, it } from 'vitest';
import { defaultEdit, renderVoice, type SoundEdit } from '$lib/core/presets';
import { PreviewPlayer } from './player';

const SR = 44100;

/** Plays through an offline context and returns what came out. */
async function render(
	seconds: number,
	play: (player: PreviewPlayer) => void
): Promise<Float32Array> {
	const context = new OfflineAudioContext(2, Math.round(seconds * SR), SR);
	const player = new PreviewPlayer(() => context as unknown as AudioContext);
	play(player);
	const buffer = await context.startRendering();
	return buffer.getChannelData(0);
}

const rms = (x: Float32Array, from: number, to: number) => {
	let sum = 0;
	for (let i = Math.floor(from * SR); i < Math.floor(to * SR); i++) sum += x[i] * x[i];
	return Math.sqrt(sum / Math.max(1, (to - from) * SR));
};

/** Zero crossings a second between two times: twice the pitch of a sine. */
const crossings = (x: Float32Array, from: number, to: number) => {
	let n = 0;
	for (let i = Math.floor(from * SR) + 1; i < Math.floor(to * SR); i++)
		if (x[i - 1] < 0 !== x[i] < 0) n++;
	return n / (to - from) / 2;
};

const sine = (hz: number, seconds: number) => ({
	sampleRate: SR,
	channels: [
		Float32Array.from(
			{ length: Math.round(seconds * SR) },
			(_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR)
		)
	]
});

describe('the preview player', () => {
	it('plays a drum key once, as long as its region', async () => {
		const kick = renderVoice({ type: 'kick', decay: 0.3 });
		const sound = { audio: kick, edit: defaultEdit(kick, 'drum') };
		const out = await render(1, (p) => p.play('k53', sound, { semitones: 0, drum: true }));
		expect(rms(out, 0, 0.1)).toBeGreaterThan(0.05);
		expect(rms(out, 0.5, 1)).toBeLessThan(1e-4);
	});

	it('plays louder with gain and higher with semitones', async () => {
		const tone = sine(220, 1);
		const base = defaultEdit(tone, 'drum', { trim: false });
		const quiet = await render(0.5, (p) =>
			p.play('a', { audio: tone, edit: base }, { semitones: 0, drum: true })
		);
		const loud = await render(0.5, (p) =>
			p.play('a', { audio: tone, edit: { ...base, gain: 6 } }, { semitones: 12, drum: true })
		);
		expect(rms(loud, 0.1, 0.4) / rms(quiet, 0.1, 0.4)).toBeCloseTo(2, 0);
		expect(crossings(quiet, 0.1, 0.4)).toBeCloseTo(220, -1);
		expect(crossings(loud, 0.1, 0.4)).toBeCloseTo(440, -1);
	});

	it('loops a sampler forever until it is let go, then fades out', async () => {
		const tone = sine(330, 0.6);
		const edit: SoundEdit = {
			...defaultEdit(tone, 'sampler', { trim: false }),
			loop: { mode: 'forever', start: 0.2 * SR, end: 0.4 * SR, crossfade: 0 }
		};
		const out = await render(2, (p) => {
			p.play('n60', { audio: tone, edit }, { semitones: 0, drum: false, hold: 1.2 });
		});
		// still sounding long after the 0.6 s sample would have ended, silent after the release
		expect(rms(out, 0.9, 1.1)).toBeGreaterThan(0.1);
		expect(rms(out, 1.7, 2)).toBeLessThan(1e-3);
	});

	it('cuts a key in the mute group off when another in it plays', async () => {
		const tone = sine(200, 1);
		const edit: SoundEdit = { ...defaultEdit(tone, 'drum', { trim: false }), playmode: 'group' };
		const out = await render(1, (p) => {
			const ctx = p.unlock() as unknown as OfflineAudioContext;
			p.play('k53', { audio: tone, edit }, { semitones: 0, drum: true, when: ctx.currentTime });
			// a second key in the group, silent itself (a short region), half way through
			const short = { ...edit, end: edit.start + 200 };
			p.play('k54', { audio: tone, edit: short }, { semitones: 0, drum: true, when: 0.3 });
		});
		expect(rms(out, 0.1, 0.25)).toBeGreaterThan(0.1);
		expect(rms(out, 0.5, 0.9)).toBeLessThan(1e-3);
	});
});
