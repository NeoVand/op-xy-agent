import { describe, expect, it } from 'vitest';
import { PresetInbox } from './preset-inbox.svelte';

const kit = (name: string) => ({ name, samples: [] });

describe('the preset inbox', () => {
	it('keeps a kit until the preset maker listens, then hands new ones over at once', () => {
		const inbox = new PresetInbox('/presets');
		inbox.put(kit('first'));
		const got: string[] = [];
		const stop = inbox.listen((draft) => got.push(draft.name));
		expect(got).toEqual(['first']);
		expect(inbox.draft).toBeNull();
		inbox.put(kit('second'));
		expect(got).toEqual(['first', 'second']);
		stop();
		inbox.put(kit('third'));
		expect(got).toEqual(['first', 'second']);
		expect(inbox.draft?.name).toBe('third');
	});
});
