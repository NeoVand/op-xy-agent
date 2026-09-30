// The lab skill (knowledge/skills/lab/SKILL.md) is what the model copies from, so its examples run
// here as written: on a replica with a beat on T1, a bass on T3 and a pad on T7, a five-part MIDI file
// attached under the name the first example uses, through the Node host and a stand-in renderer.
// Each must finish and land a commit. The skill's frontmatter is checked too.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { encodeMidiFile, tempoMeta, textMeta } from '$lib/core/midi/smf';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { clickRenderer, files } from '../testing/lab';
import { createNodeLabHost } from './node';

const skill = readFileSync(join(process.cwd(), 'knowledge/skills/lab/SKILL.md'), 'utf8');
const examples = [...skill.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);

const PPQ = 96;

/** A part on `channel`: `pitches` in turn, a note every half beat, over `bars` from `from`. */
function part(name: string, channel: number, from: number, bars: number, pitches: number[]) {
	const events = Array.from({ length: bars * 8 }, (_, i) => {
		const at = Math.round((from * 4 + i / 2) * PPQ);
		const note = pitches[i % pitches.length];
		return [
			{ tick: at, event: { type: 'noteOn' as const, channel, note, velocity: 100 } },
			{ tick: at + PPQ / 4, event: { type: 'noteOff' as const, channel, note, velocity: 0 } }
		];
	}).flat();
	return { events: [{ tick: 0, event: textMeta(0x03, name) }, ...events] };
}

/** Brother Louie's shape, made up: drums, bass, chords, a lead split between two tracks. */
function song(): Uint8Array {
	return encodeMidiFile({
		format: 1,
		division: { kind: 'ppq', ticksPerQuarter: PPQ },
		tracks: [
			{ events: [{ tick: 0, event: tempoMeta(112) }] },
			part('drums', 9, 0, 8, [36, 42, 38, 42]),
			part('bass', 1, 0, 8, [33, 33, 40, 45]),
			part('strings', 2, 0, 8, [57, 60, 64]),
			part('lead verse', 3, 0, 4, [69, 71, 72, 74, 76]),
			part('lead chorus', 4, 4, 4, [76, 74, 72, 71])
		]
	});
}

function setup() {
	const sim = new OpxySim({ now: () => 0 });
	const replica = createVirtualOpxy({ sim });
	replica.writePattern(1, {
		pattern: 1,
		bars: 1,
		notes: [
			...[1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 })),
			...[3, 7, 11, 15].map((step) => ({ step, note: 61, velocity: 80, length: 1 }))
		]
	});
	replica.writePattern(3, {
		pattern: 1,
		bars: 1,
		notes: [1, 4, 7, 11].map((step) => ({ step, note: 45, velocity: 100, length: 2 }))
	});
	replica.writePattern(7, {
		pattern: 1,
		bars: 1,
		notes: [57, 60, 64].map((note) => ({ step: 1, note, velocity: 80, length: 16 }))
	});
	const host = createNodeLabHost({ sim, render: clickRenderer() });
	return { host, replica };
}

describe('the lab skill', () => {
	it('names itself and says when to use it, in under 250 lines', () => {
		const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skill);
		expect(front?.[1]).toBe('lab');
		expect(front?.[2].length).toBeGreaterThan(40);
		expect(skill.split('\n').length).toBeLessThan(250);
		expect(examples.length).toBeGreaterThanOrEqual(3);
	});

	it.each(examples.map((code, i) => [i + 1, code] as const))(
		'example %i runs as written and commits',
		async (_n, code) => {
			const { host } = setup();
			const { result, landed } = await host.run(code, {
				signal: new AbortController().signal,
				timeoutMs: 20_000,
				files: files({ 'brother louie.mid': song() })
			});
			expect(result.error).toBeUndefined();
			expect(result.ok).toBe(true);
			expect(result.commits.length).toBeGreaterThan(0);
			expect(landed).not.toBeNull();
		}
	);
});
