/**
 * The sample library (manual: sampler/sample-library, sampler/sample-files): every sample on the
 * unit, in folders; sub-folders nest and show their names in square brackets. The factory content
 * is a stand-in catalogue (names and lengths, waveforms from seeds); recordings land in `user`.
 * The browser shows two columns: the folders beside the open one, and what the open folder holds.
 */
import type { SampleFile, SampleState } from './state';
import { kitFiles, sampleFile } from './state';
import { DEMO_SEED, hashSeed, random } from './wave';

/** An entry of a folder: a sub-folder or a sample. */
export type LibraryNode =
	| { readonly kind: 'folder'; readonly name: string; readonly children: () => LibraryNode[] }
	| { readonly kind: 'file'; readonly file: SampleFile };

/**
 * The top folders. TE's art shows bass … sampler; recordings go to user (manual: drum-sampler
 * "saved"). The names of bass's first eight samples are the ones TE's art lists; the rest are ours.
 */
const TOP = ['bass', 'drum', 'keys', 'lead', 'organ', 'pad', 'pluck', 'sampler', 'user'] as const;

const BASS = [
	'aeroplane',
	'apes are us',
	'cherry',
	'classix',
	'exoex',
	'grits',
	'hard spunch',
	'lubowa',
	'moss',
	'nimbus',
	'orbit',
	'pebble',
	'quartz',
	'rover',
	'sable',
	'tundra',
	'velvet',
	'wren'
];

/** Stand-in names for the other factory folders (our own words). */
const WORDS = [
	'amber',
	'bloom',
	'cinder',
	'drift',
	'ember',
	'fable',
	'glow',
	'harbor',
	'indigo',
	'juniper',
	'kelp',
	'lumen',
	'meadow',
	'nova'
];

/** A factory folder of stand-in samples: `names`, lengths from the folder's seed. */
function factory(
	folder: string,
	names: readonly string[],
	seconds: [number, number]
): LibraryNode[] {
	const next = random(hashSeed(folder));
	return names.map((name) => {
		const length = round2(seconds[0] + (seconds[1] - seconds[0]) * next());
		// TE's art shows its demo roll on cherry's tile: our cherry is that stand-in, 3.1 s long
		if (folder === 'bass' && name === 'cherry') {
			return { kind: 'file', file: sampleFile('cherry.wav', folder, 3.1, DEMO_SEED) };
		}
		return { kind: 'file', file: sampleFile(`${name}.wav`, folder, length) };
	});
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The kit folders inside drum: the drum sampler's factory kits (`kit 1` … `kit 8`). */
function kits(): LibraryNode[] {
	return Array.from({ length: 8 }, (_, k) => ({
		kind: 'folder' as const,
		name: `kit ${k + 1}`,
		children: () => kitFiles(k).map((file): LibraryNode => ({ kind: 'file', file }))
	}));
}

/** The library's top folders, the user folder filled from the state. */
export function libraryRoot(state: SampleState): LibraryNode[] {
	return TOP.map((name) => ({
		kind: 'folder' as const,
		name,
		children: (): LibraryNode[] => {
			switch (name) {
				case 'bass':
					return factory('bass', BASS, [2.5, 6]);
				case 'drum':
					return kits();
				case 'user':
					return state.user.map((file) => ({ kind: 'file' as const, file }));
				default:
					return factory(name, WORDS.slice(0, 6 + (hashSeed(name) % 8)), [2.5, 8]);
			}
		}
	}));
}

/**
 * What the folder a path leads to holds (the root for an empty path). Each index counts only the
 * sub-folders of its level, as the left column lists them.
 */
export function openFolder(state: SampleState, path: readonly number[]): LibraryNode[] {
	let nodes = libraryRoot(state);
	for (const index of path) {
		const node = nodes.filter((n) => n.kind === 'folder')[index];
		if (!node || node.kind !== 'folder') return nodes;
		nodes = node.children();
	}
	return nodes;
}

/** How an entry reads in the right column: sub-folders in square brackets. */
export function entryName(node: LibraryNode): string {
	return node.kind === 'folder'
		? `[${node.name}]`
		: node.file.name.replace(/\.(wav|aif|aiff)$/, '');
}

/** The browser's columns: the open folder's parent level, its index there, and its entries. */
export function browse(state: SampleState): {
	siblings: LibraryNode[];
	open: number;
	entries: LibraryNode[];
} {
	const path = state.library.path.length > 0 ? state.library.path : [0];
	const parent = openFolder(state, path.slice(0, -1));
	const entries = openFolder(state, path);
	return { siblings: parent, open: path[path.length - 1], entries };
}
