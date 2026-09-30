/**
 * What the command palette offers (`ui/shell/palette`): the site's pages, the manual's and the
 * theme (root layout), and on the home page the replica's and the agent's own: play, a tempo, the
 * metronome, a scale lit, the large display, the song as MIDI; ask, stop, take back an answer's
 * changes, a new conversation, the settings, an example to watch without a key.
 *
 * A command is made for what is typed where the typing is its argument: "tempo 128", "c minor",
 * and anything to ask the agent, which leads when it reads as a question or a sentence.
 */
import { TEMPO_RANGE } from '$lib/sim/params';
import { readsAsAsk, words, type PaletteCommand } from '$lib/ui/shell/palette';
import { GUIDE_SCALES, ROOT_NAMES, type GuideScale } from './scale-guide.svelte';

/** The replica as the palette sees it, and what it does to it. */
export interface ReplicaPalette {
	readonly playing: boolean;
	/** A connected OP-XY plays: its tempo is its own. */
	readonly live: boolean;
	readonly bpm: number;
	readonly metronome: boolean;
	/** The computer keyboard plays the replica (space plays and stops). */
	readonly keys: boolean;
	/** The display shows large over the device. */
	readonly large: boolean;
	readonly sound: { readonly available: boolean; readonly on: boolean };
	/** The scale lit on the keyboard ("A minor", or null) and its root, 0–11. */
	readonly scale: { readonly root: number; readonly lit: string | null } | null;
	play(): void;
	setTempo(bpm: number): void;
	setMetronome(on: boolean): void;
	lightScale(root: number, scale: GuideScale | null): void;
	showLarge(on: boolean): void;
	toggleSound(): void;
	toggleKeys(): void;
	downloadSong(): void;
}

/** An example of the agent at work, to watch without a key (`$lib/agent/examples/list.json`). */
export interface PaletteExample {
	readonly id: string;
	readonly title: string;
	readonly about: string;
	readonly ask: string;
}

/** The agent as the palette sees it (the agent panel's `paletteState`). */
export interface AgentPaletteState {
	/** A message goes now: an agent runs, it is not busy and no example plays. */
	readonly ready: boolean;
	readonly busy: boolean;
	/** The example playing, by its title. */
	readonly example: string | null;
	/** The examples to watch (only while there is no key). */
	readonly examples: readonly PaletteExample[];
	/** A key is in: without one, asking opens the settings. */
	readonly hasKey: boolean;
	/** There is a conversation to leave for a new one. */
	readonly conversation: boolean;
	/** What the last answer changed on the replica, and whether it can be taken back or put back. */
	readonly lastChanges: {
		readonly lines: readonly string[];
		readonly undo: 'ready' | 'undone';
	} | null;
}

/** What the palette asks of the agent. */
export interface AgentPalette {
	readonly state: AgentPaletteState;
	/** Sends it, or keeps it in the composer for later (busy, no key). */
	ask(text: string): void;
	stop(): void;
	/** Takes back the last answer's changes, or puts them back. */
	toggleLastChanges(): void;
	newConversation(): void;
	settings(): void;
	watch(id: string): void;
	back(): void;
}

/** A tempo typed: "128", "tempo 98.5", "set the tempo to 120 bpm". */
export function typedTempo(query: string): number | null {
	const m =
		/^(?:set\s+)?(?:the\s+)?(?:tempo|bpm)?(?:\s+to)?\s*(\d{2,3}(?:\.\d)?)\s*(?:bpm)?$/i.exec(
			query.trim()
		);
	if (!m) return null;
	const bpm = Number(m[1]);
	return bpm >= TEMPO_RANGE.min && bpm <= TEMPO_RANGE.max ? bpm : null;
}

const LETTERS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** A scale typed: "c minor", "light f# dorian", "eb blues scale", "a min pent". */
export function typedScale(
	query: string
): { root: number; name: string; scale: GuideScale } | null {
	const q = query
		.trim()
		.toLowerCase()
		.replace(/^(?:light|show)\s+/, '')
		.replace(/^(?:the|a)\s+(?=[a-g][#b♯♭]?\s)/, '')
		.replace(/\s+scale$/, '');
	const m = /^([a-g])(#|b|♯|♭)?\s+([a-z ]+)$/.exec(q);
	if (!m) return null;
	const typed = words(m[3]);
	const scale = GUIDE_SCALES.find((s) => {
		const own = words(s.name);
		return typed.length <= own.length && typed.every((w, i) => own[i].startsWith(w));
	});
	if (!scale) return null;
	const shift = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
	const root = (LETTERS[m[1]] + shift + 12) % 12;
	const name = m[1].toUpperCase() + (shift === 1 ? '#' : shift === -1 ? 'b' : '');
	return { root, name, scale };
}

const quote = (text: string) => `“${text.length > 60 ? `${text.slice(0, 59)}…` : text}”`;

/** The home page's commands: the replica's, then the agent's (null before its panel is up). */
export function homeCommands(
	query: string,
	replica: ReplicaPalette,
	agent: AgentPalette | null
): PaletteCommand[] {
	const q = query.trim();
	const out: PaletteCommand[] = [];
	const a = agent?.state;

	if (q && agent && a) {
		const ask = readsAsAsk(q) ? 0.9 : 0.3;
		out.push(
			a.ready
				? {
						id: 'ask',
						label: `ask ${quote(q)}`,
						group: 'agent',
						score: ask,
						run: () => agent.ask(q)
					}
				: a.busy && !a.example
					? {
							id: 'ask',
							label: `ask ${quote(q)} next`,
							detail: 'waits in the composer until this answer is written',
							group: 'agent',
							score: ask,
							run: () => agent.ask(q)
						}
					: {
							id: 'ask',
							label: `add your key to ask ${quote(q)}`,
							group: 'agent',
							score: ask,
							run: () => agent.ask(q)
						}
		);
	}

	out.push({
		id: 'play',
		label: replica.playing ? 'stop' : 'play',
		detail: replica.playing ? undefined : `${replica.bpm} bpm`,
		group: 'replica',
		keywords: 'transport start pause',
		hint: replica.keys ? 'space' : undefined,
		suggest: true,
		run: () => replica.play()
	});

	if (a?.busy) {
		out.push({
			id: 'agent.stop',
			label: 'stop the agent',
			group: 'agent',
			keywords: 'cancel halt',
			suggest: true,
			run: () => agent?.stop()
		});
	}
	if (a?.lastChanges && !a.busy) {
		const back = a.lastChanges.undo === 'undone';
		out.push({
			id: 'agent.undo',
			label: back ? 'put back the last answer’s changes' : 'undo the last answer’s changes',
			detail: a.lastChanges.lines.join('; '),
			group: 'agent',
			keywords: back ? 'redo restore' : 'take back revert',
			suggest: !back,
			run: () => agent?.toggleLastChanges()
		});
	}

	out.push({
		id: 'large',
		label: replica.large ? 'put the large display back' : 'show the display large',
		group: 'replica',
		keywords: 'screen big zoom',
		suggest: true,
		run: () => replica.showLarge(!replica.large)
	});

	const bpm = typedTempo(q);
	if (bpm !== null && !replica.live) {
		out.push({
			id: 'tempo',
			label: `tempo ${bpm} bpm`,
			detail: `now ${replica.bpm}`,
			group: 'replica',
			score: 1,
			run: () => replica.setTempo(bpm)
		});
	}
	if (!replica.live) {
		out.push({
			id: 'metronome',
			label: replica.metronome ? 'metronome off' : 'metronome on',
			group: 'replica',
			keywords: 'click',
			run: () => replica.setMetronome(!replica.metronome)
		});
	}

	if (replica.scale) {
		const guide = replica.scale;
		const typed = typedScale(q);
		if (typed) {
			out.push({
				id: `scale:${typed.root}:${typed.scale.name}`,
				label: `light the ${typed.name} ${typed.scale.name} scale`,
				detail: 'on the keyboard',
				group: 'replica',
				score: 1,
				run: () => replica.lightScale(typed.root, typed.scale)
			});
		}
		// the scales from the root lit last, to browse ("scale", "dorian")
		for (const scale of GUIDE_SCALES) {
			out.push({
				id: `scale:${guide.root}:${scale.name}`,
				label: `light the ${ROOT_NAMES[guide.root]} ${scale.name} scale`,
				detail: 'on the keyboard',
				group: 'replica',
				keywords: 'scale keyboard guide',
				run: () => replica.lightScale(guide.root, scale)
			});
		}
		if (guide.lit) {
			out.push({
				id: 'scale.off',
				label: 'turn the scale off',
				detail: `${guide.lit} is lit`,
				group: 'replica',
				keywords: 'keyboard guide unlight',
				suggest: true,
				run: () => replica.lightScale(guide.root, null)
			});
		}
	}

	if (replica.sound.available) {
		out.push({
			id: 'sound',
			label: replica.sound.on ? 'sound off' : 'sound on',
			group: 'replica',
			keywords: 'mute audio volume speaker',
			run: () => replica.toggleSound()
		});
	}
	out.push({
		id: 'keys',
		label: replica.keys ? 'computer keyboard off' : 'computer keyboard on',
		detail: replica.keys ? 'your keys stop playing the replica' : 'your keys play the replica',
		group: 'replica',
		keywords: 'typing play keys',
		run: () => replica.toggleKeys()
	});
	out.push({
		id: 'download.song',
		label: 'download the song as midi',
		group: 'replica',
		keywords: 'export save file mid',
		suggest: true,
		run: () => replica.downloadSong()
	});

	if (agent && a) {
		if (a.conversation && !a.example) {
			out.push({
				id: 'agent.new',
				label: 'new conversation',
				group: 'agent',
				keywords: 'chat thread clear fresh',
				suggest: true,
				run: () => agent.newConversation()
			});
		}
		if (a.example) {
			out.push({
				id: 'example.back',
				label: 'back to your project',
				detail: `leaves the example “${a.example}”`,
				group: 'example',
				keywords: 'leave stop example',
				suggest: true,
				run: () => agent.back()
			});
		}
		for (const example of a.examples) {
			out.push({
				id: `example:${example.id}`,
				label: `watch “${example.title}”`,
				detail: example.about,
				group: 'example',
				keywords: `example demo ${example.about}`,
				run: () => agent.watch(example.id)
			});
		}
		out.push(
			a.hasKey
				? {
						id: 'agent.settings',
						label: 'agent settings',
						detail: 'keys, model, voice',
						group: 'agent',
						keywords: 'key api model voice anthropic openai',
						run: () => agent.settings()
					}
				: {
						id: 'agent.settings',
						label: 'add your anthropic key',
						detail: 'to ask your own',
						group: 'agent',
						keywords: 'settings api model voice openai',
						suggest: true,
						run: () => agent.settings()
					}
		);
	}
	return out;
}

/** A page of the manual as the palette lists it (`/manual/index.json`). */
export interface ManualEntry {
	readonly id: string;
	readonly title: string;
	readonly area: string;
}

/** The site as the palette sees it. */
export interface SitePalette {
	/** The route shown ("/", "/manual/[id]"…). */
	readonly route: string | null;
	/** Development builds list the developer pages too. */
	readonly dev: boolean;
	/** The manual's pages, once loaded. */
	readonly manual: readonly ManualEntry[] | null;
	readonly theme: 'dark' | 'light';
	/** Opens a page of the site, in a new tab when asked (the home page keeps its place). */
	open(page: SitePage, tab: boolean): void;
	toggleTheme(): void;
}

/** A page of the site the palette opens. */
export type SitePath = '/' | '/manual' | '/presets' | '/styleguide' | '/replica' | '/lab';

/** Where the palette goes: a page, or a page of the manual. */
export type SitePage =
	{ readonly to: SitePath } | { readonly to: '/manual/[id]'; readonly id: string };

/** The site's commands: its pages, the theme, and the manual's pages once something is typed. */
export function siteCommands(query: string, site: SitePalette): PaletteCommand[] {
	const home = site.route === '/';
	const pages: readonly { to: SitePath; label: string; keywords: string }[] = [
		{ to: '/', label: 'home', keywords: 'replica agent' },
		{ to: '/manual', label: 'manual', keywords: 'guide help docs' },
		{ to: '/presets', label: 'preset maker', keywords: 'kit sampler presets sounds' },
		...(site.dev
			? ([
					{ to: '/styleguide', label: 'styleguide', keywords: 'design tokens' },
					{ to: '/replica', label: 'replica page', keywords: 'device' },
					{ to: '/lab', label: 'device lab', keywords: 'probe usb midi' }
				] as const)
			: [])
	];
	const out: PaletteCommand[] = pages
		.filter((page) => page.to !== site.route)
		.map((page) => ({
			id: `go:${page.to}`,
			label: page.label,
			group: 'go to',
			keywords: page.keywords,
			suggest: page.to === '/manual' || page.to === '/',
			run: () => site.open({ to: page.to }, false)
		}));
	out.push({
		id: 'theme',
		label: site.theme === 'dark' ? 'light theme' : 'dark theme',
		group: 'look',
		keywords: 'theme colour color mode appearance',
		run: () => site.toggleTheme()
	});
	if (query.trim() && site.manual) {
		for (const entry of site.manual) {
			out.push({
				id: `manual:${entry.id}`,
				label: entry.title,
				detail: entry.area,
				group: home ? 'manual ↗' : 'manual',
				keywords: `manual ${entry.area}`,
				run: () => site.open({ to: '/manual/[id]', id: entry.id }, home)
			});
		}
	}
	return out;
}
