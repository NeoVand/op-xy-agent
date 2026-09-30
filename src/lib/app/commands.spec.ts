// The palette's commands on the home page and across the site: what shows with nothing typed,
// a command made for what is typed (a tempo, a scale, something to ask), and what each one does.
import { describe, expect, it, vi } from 'vitest';
import { rank } from '$lib/ui/shell/palette';
import {
	homeCommands,
	siteCommands,
	typedScale,
	typedTempo,
	type AgentPalette,
	type AgentPaletteState,
	type ReplicaPalette,
	type SitePalette
} from './commands';

function replica(over: Partial<ReplicaPalette> = {}): ReplicaPalette {
	return {
		playing: false,
		live: false,
		bpm: 120,
		metronome: true,
		keys: true,
		large: false,
		sound: { available: true, on: true },
		scale: { root: 9, lit: null },
		play: vi.fn(),
		setTempo: vi.fn(),
		setMetronome: vi.fn(),
		lightScale: vi.fn(),
		showLarge: vi.fn(),
		toggleSound: vi.fn(),
		toggleKeys: vi.fn(),
		downloadSong: vi.fn(),
		...over
	};
}

function agent(state: Partial<AgentPaletteState> = {}): AgentPalette {
	return {
		state: {
			ready: true,
			busy: false,
			example: null,
			examples: [],
			hasKey: true,
			conversation: false,
			lastChanges: null,
			...state
		},
		ask: vi.fn(),
		stop: vi.fn(),
		toggleLastChanges: vi.fn(),
		newConversation: vi.fn(),
		settings: vi.fn(),
		watch: vi.fn(),
		back: vi.fn()
	};
}

const labels = (query: string, r: ReplicaPalette, a: AgentPalette | null) =>
	rank(query, homeCommands(query, r, a)).map((c) => c.label);

describe('the home page’s commands', () => {
	it('suggest the likely ones while nothing is typed', () => {
		const a = agent({
			conversation: true,
			lastChanges: { lines: ['T1 pattern 1: 0 → 16 notes'], undo: 'ready' }
		});
		expect(labels('', replica(), a)).toEqual([
			'play',
			'undo the last answer’s changes',
			'show the display large',
			'download the song as midi',
			'new conversation'
		]);
		expect(labels('', replica({ playing: true }), agent({ busy: true }))).toEqual([
			'stop',
			'stop the agent',
			'show the display large',
			'download the song as midi'
		]);
	});

	it('ask the agent what reads as a question first, and after a command it names', () => {
		const a = agent();
		expect(labels('make it busier', replica(), a)[0]).toBe('ask “make it busier”');
		expect(labels('play', replica(), a)).toEqual(['play', 'computer keyboard off', 'ask “play”']);
		rank('make it busier', homeCommands('make it busier', replica(), a))[0].run();
		expect(a.ask).toHaveBeenCalledWith('make it busier');
		// without a key the settings open, the question kept for when one is in
		expect(labels('why?', replica(), agent({ ready: false, hasKey: false }))[0]).toBe(
			'add your key to ask “why?”'
		);
		expect(labels('why?', replica(), agent({ ready: false, busy: true }))[0]).toBe(
			'ask “why?” next'
		);
	});

	it('set a tempo and light a scale from what is typed', () => {
		const r = replica();
		const [tempo] = rank('tempo 128', homeCommands('tempo 128', r, null));
		expect(tempo.label).toBe('tempo 128 bpm');
		tempo.run();
		expect(r.setTempo).toHaveBeenCalledWith(128);
		// a connected OP-XY keeps its own tempo
		expect(labels('128', replica({ live: true }), null)).not.toContain('tempo 128 bpm');

		const [scale, ...more] = rank('f# dorian', homeCommands('f# dorian', r, null));
		expect(scale.label).toBe('light F# dorian');
		scale.run();
		expect(r.lightScale).toHaveBeenCalledWith(6, expect.objectContaining({ name: 'dorian' }));
		// the same scale from the root lit is one row
		expect(more.map((c) => c.label)).not.toContain('light F# dorian');
		expect(labels('a minor', r, null).filter((l) => l === 'light A minor')).toHaveLength(1);
		expect(labels('scale', r, null)).toContain('light A dorian');
		expect(labels('scale off', replica({ scale: { root: 9, lit: 'A minor' } }), null)[0]).toBe(
			'scale off'
		);
	});

	it('take back or put back the last answer’s changes', () => {
		const a = agent({ lastChanges: { lines: ['tempo: 120 → 124'], undo: 'undone' } });
		const [row] = rank('put back', homeCommands('put back', replica(), a));
		expect(row.label).toBe('put back the last answer’s changes');
		expect(row.detail).toBe('tempo: 120 → 124');
		row.run();
		expect(a.toggleLastChanges).toHaveBeenCalled();
	});

	it('offer the examples, and the way back from one', () => {
		const examples = [{ id: 'kit', title: 'a 909 kit', about: 'a kit, then a beat', ask: 'kit' }];
		const a = agent({ ready: false, hasKey: false, examples });
		const [watch] = rank('watch 909', homeCommands('watch 909', replica(), a));
		expect(watch.label).toBe('watch “a 909 kit”');
		watch.run();
		expect(a.watch).toHaveBeenCalledWith('kit');
		expect(labels('', replica(), agent({ ready: false, example: 'a 909 kit' }))).toContain(
			'back to your project'
		);
	});
});

describe('what is typed', () => {
	it('reads a tempo', () => {
		expect(typedTempo('128')).toBe(128);
		expect(typedTempo('tempo 98.5')).toBe(98.5);
		expect(typedTempo('set the tempo to 120 bpm')).toBe(120);
		expect(typedTempo('999')).toBeNull();
		expect(typedTempo('track 3')).toBeNull();
	});

	it('reads a scale', () => {
		expect(typedScale('c minor')).toMatchObject({ root: 0, name: 'C', scale: { name: 'minor' } });
		expect(typedScale('light eb blues scale')).toMatchObject({ root: 3, name: 'Eb' });
		expect(typedScale('b minor')).toMatchObject({ root: 11, name: 'B' });
		expect(typedScale('bb min pent')).toMatchObject({
			root: 10,
			scale: { name: 'minor pentatonic' }
		});
		expect(typedScale('a minor chord')).toBeNull();
		expect(typedScale('make it busier')).toBeNull();
	});
});

describe('the site’s commands', () => {
	const site = (over: Partial<SitePalette> = {}): SitePalette => ({
		route: '/',
		dev: false,
		manual: [
			{ id: 'sequencer.parameter-locks', title: 'Parameter locks', area: 'sequencer' },
			{ id: 'synth.filter', title: 'Filter (M3)', area: 'synth engines' }
		],
		theme: 'dark',
		open: vi.fn(),
		toggleTheme: vi.fn(),
		...over
	});

	it('open a manual page in a new tab from the home page, in place elsewhere', () => {
		const home = site();
		const [page] = rank('filter', siteCommands('filter', home));
		expect(page.label).toBe('Filter (M3)');
		page.run();
		expect(home.open).toHaveBeenCalledWith({ to: '/manual/[id]', id: 'synth.filter' }, true);
		const manual = site({ route: '/manual/[id]' });
		rank('locks', siteCommands('locks', manual))[0].run();
		expect(manual.open).toHaveBeenCalledWith(
			{ to: '/manual/[id]', id: 'sequencer.parameter-locks' },
			false
		);
	});

	it('go to the other pages, the developer ones only in development', () => {
		expect(rank('', siteCommands('', site())).map((c) => c.label)).toEqual(['manual']);
		expect(rank('', siteCommands('', site({ route: '/manual' }))).map((c) => c.label)).toEqual([
			'home'
		]);
		expect(rank('lab', siteCommands('lab', site())).map((c) => c.label)).toEqual([]);
		expect(rank('lab', siteCommands('lab', site({ dev: true }))).map((c) => c.label)).toEqual([
			'device lab'
		]);
		expect(rank('home', siteCommands('home', site({ route: '/presets' })))[0].label).toBe('home');
	});
});
