// Quick replies come from the turn: a closing offer is answered yes (or by its alternatives), then
// next steps from what the turn changed or showed; nothing after an error or an answer to nothing.
import { describe, expect, it } from 'vitest';
import type { ChatEntry } from './chat';
import { questionReplies, quickReplies } from './quick-replies';

const user = (text: string): ChatEntry => ({ kind: 'user', id: `u-${text}`, text });
const answer = (text: string): ChatEntry => ({
	kind: 'text',
	id: `a-${text.length}`,
	agent: 'conductor',
	parent: null,
	text,
	citations: []
});
const tool = (name: string): ChatEntry => ({
	kind: 'tool',
	id: `t-${name}`,
	agent: 'conductor',
	parent: null,
	name,
	label: name,
	toolKind: 'read',
	status: 'ok',
	input: {},
	summary: ''
});
const changes = (...lines: string[]): ChatEntry => ({
	kind: 'changes',
	id: 'c',
	lines,
	undo: 'ready'
});

describe('questionReplies', () => {
	it('answers an offer yes, or with its alternatives', () => {
		expect(questionReplies('Done. **Want me to add a fill?**')).toEqual(['yes, do it']);
		expect(questionReplies('Shall I add a fill, or make it a song?')).toEqual([
			'add a fill',
			'make it a song'
		]);
		expect(questionReplies('It pumps now.\n\nShould I push the duck deeper?')).toEqual([
			'yes, do it'
		]);
	});

	it('offers the choices a question lists', () => {
		expect(questionReplies('Happy to. What vibe: dark, bouncy or dreamy?')).toEqual([
			'dark',
			'bouncy',
			'dreamy'
		]);
		expect(questionReplies('Darker or brighter?')).toEqual(['darker', 'brighter']);
		// the words of a question that asks are no answer
		expect(questionReplies('Is it the kick or the bass?')).toEqual([]);
	});

	it('offers nothing for a question that is not an offer, or none at all', () => {
		expect(questionReplies('What key is your song in?')).toEqual([]);
		expect(questionReplies('It runs at 100 now.')).toEqual([]);
		// alternatives too long to be chips: a plain yes
		expect(
			questionReplies(
				'Want me to rewrite the bassline so it follows the kick on every beat, or leave it?'
			)
		).toEqual(['yes, do it']);
	});
});

describe('quickReplies', () => {
	it('follows a pattern written with busier, a song, and learning to do it', () => {
		const entries = [
			user('give me a house beat'),
			tool('write_pattern'),
			answer('Four on the floor on T1, hats on the offbeats.'),
			changes('T1 pattern 1: 0 → 8 notes')
		];
		expect(quickReplies(entries)).toEqual([
			'make it busier',
			'turn it into a song',
			'teach me to do that'
		]);
	});

	it('puts the closing offer first, and keeps to three', () => {
		const entries = [
			user('darker bass'),
			tool('set_sound'),
			answer('Cutoff down to 40. Want me to add a little resonance?'),
			changes('T3 M3 filter: svf filter on: cutoff 64 → svf filter on: cutoff 40')
		];
		expect(quickReplies(entries)).toEqual(['yes, do it', 'a bit more', 'teach me to do that']);
	});

	it('offers a walkthrough after a combo was shown, and nothing after an error', () => {
		const shown = [user('what does shift + M1 do?'), tool('show_on_replica'), answer('It opens…')];
		expect(quickReplies(shown)).toEqual(['walk me through it']);
		const failed: ChatEntry[] = [
			user('hi'),
			{ kind: 'notice', id: 'n', tone: 'error', text: 'key rejected', code: null }
		];
		expect(quickReplies(failed)).toEqual([]);
		expect(quickReplies([user('hi'), answer('Hello! Ask me anything about the OP-XY.')])).toEqual(
			[]
		);
	});

	it('forgets a turn that was taken back', () => {
		const entries: ChatEntry[] = [
			user('faster'),
			answer('At 128 now.'),
			{ kind: 'changes', id: 'c', lines: ['tempo 120 → 128 bpm'], undo: 'undone' }
		];
		expect(quickReplies(entries)).toEqual([]);
	});
});
