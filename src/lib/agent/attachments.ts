/**
 * Files the user gives the agent: a photo of sheet music, a chord chart, a screenshot of the OP-XY's
 * screen, a PDF score, a MIDI file, an ABC or MusicXML file, lyrics. They are prepared here, in the
 * browser, and go only to the Anthropic API inside the user's message, the same way as the text:
 *
 * - **images** become an `image` block, scaled to at most 2000 px on the long edge and 4784 visual
 *   tokens (28 × 28 px patches): the full detail Opus 5.5 reads, and within the API's stricter size
 *   rule for requests holding more than 20 images. Line art (PNG, GIF, WebP, SVG) stays PNG so
 *   staff lines stay sharp; photos go as JPEG. Transparent areas become white paper.
 * - **PDFs** become a `document` block: the model reads every page as text and as an image.
 * - **MIDI files** are read by our own parser and sent as a plain-text `document` listing every
 *   note (`midi-text.ts`): models cannot read binary MIDI and must not guess what is in the file.
 * - **text** (ABC, MusicXML, chord sheets, tabs, CSV, JSON…) becomes a plain-text `document`.
 *
 * The chat keeps a small view of each file (kind, name, size, one line of detail and a thumbnail
 * for images); the transcript keeps the blocks, so a thread reopened later still has its files.
 */
import type {
	BetaContentBlockParam,
	BetaImageBlockParam,
	BetaMessageParam
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { MidiText } from './midi-text';

/** What a file is, for the model and for the chat. */
export type AttachmentKind = 'image' | 'pdf' | 'midi' | 'text';

/** What the chat shows of a file (small: it is stored with the message). */
export interface AttachmentView {
	readonly id: string;
	readonly kind: AttachmentKind;
	readonly name: string;
	/** Bytes of the original file. */
	readonly size: number;
	/** One short line: "1500 × 2000", "12 pages", "3 tracks · 412 notes · 1:32", "84 lines". */
	readonly detail: string;
	/** A small JPEG data URL (images only). */
	readonly thumb?: string;
}

/** A file ready to send. */
export interface PreparedAttachment {
	readonly view: AttachmentView;
	/** What the model receives: a label and the image, or the document block. */
	readonly blocks: readonly BetaContentBlockParam[];
	/** Characters this file adds to every request (base64 or text). */
	readonly bytes: number;
}

/**
 * A file that cannot be attached. The message is a short reason, shown when the user points at the
 * file's red light, so it never repeats the file's name.
 */
export class AttachmentError extends Error {
	override name = 'AttachmentError';
}

/** Limits, from the API's (docs: vision, PDF support; 32 MB per request, conversation included). */
export const ATTACHMENT_LIMITS = {
	/** Files in one message. */
	perMessage: 10,
	/** Characters of every file in one conversation: the whole transcript goes with each request. */
	conversationBytes: 24 * 1024 * 1024,
	/** The largest file the app opens at all. */
	fileBytes: 64 * 1024 * 1024,
	/** A PDF's size (base64 adds a third) and pages (the API's limit below 1M-token contexts). */
	pdfBytes: 18 * 1024 * 1024,
	pdfPages: 100,
	/** Characters of a text file (about 50k tokens). */
	textChars: 200_000,
	/** Notes listed from a MIDI file (about 40k tokens). */
	midiNotes: 4000,
	/** An image's long edge in pixels and its visual tokens. */
	imageEdge: 2000,
	imageTokens: 4784,
	/** The API's per-image limit is 10 MB of base64: stay well under it. */
	imageBytes: 7 * 1024 * 1024,
	/** Thumbnail long edge in the chat. */
	thumbEdge: 192
} as const;

/** What the file picker offers. */
export const ATTACHMENT_ACCEPT = [
	'image/*',
	'.pdf',
	'.mid',
	'.midi',
	'.kar',
	'.txt',
	'.md',
	'.csv',
	'.json',
	'.abc',
	'.musicxml',
	'.xml',
	'.mei',
	'.ly',
	'.chordpro',
	'.cho',
	'.tab'
].join(',');

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico'];
const LINE_ART = /^image\/(png|gif|webp|bmp|svg\+xml)$/;
const MIDI_EXTENSIONS = ['mid', 'midi', 'smf', 'kar', 'rmi'];
const TEXT_EXTENSIONS = [
	'txt',
	'text',
	'md',
	'markdown',
	'csv',
	'tsv',
	'json',
	'abc',
	'xml',
	'musicxml',
	'mei',
	'ly',
	'ily',
	'chordpro',
	'chopro',
	'cho',
	'crd',
	'pro',
	'tab',
	'lrc',
	'yaml',
	'yml',
	'log'
];

function extension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** What kind of attachment a file makes, from its name and type; null when unsupported. */
export function attachmentKind(name: string, type: string): AttachmentKind | null {
	const ext = extension(name);
	const mime = type.toLowerCase();
	if (MIDI_EXTENSIONS.includes(ext) || /^audio\/(x-)?midi?$/.test(mime)) return 'midi';
	if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
	if (mime.startsWith('image/') || IMAGE_EXTENSIONS.includes(ext)) {
		return ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif')
			? null
			: 'image';
	}
	if (
		TEXT_EXTENSIONS.includes(ext) ||
		mime.startsWith('text/') ||
		mime === 'application/json' ||
		mime.endsWith('+xml') ||
		mime === 'application/xml'
	) {
		return 'text';
	}
	return null;
}

/** Why a file cannot be attached (a short reason, without the file's name). */
export function unsupportedReason(name: string, type: string): string {
	const ext = extension(name);
	const mime = type.toLowerCase();
	if (ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif')) {
		return 'A HEIC photo, which this browser cannot open. Share it as JPEG, or attach a screenshot of it.';
	}
	if (ext === 'mxl') {
		return 'Compressed MusicXML: export it as uncompressed MusicXML (.musicxml) and attach that.';
	}
	if (
		mime.startsWith('audio/') ||
		mime.startsWith('video/') ||
		['wav', 'mp3', 'aif', 'aiff', 'm4a', 'flac', 'ogg', 'mp4', 'mov'].includes(ext)
	) {
		return 'Audio or video: the agent cannot listen yet. A MIDI file or a photo of the score works.';
	}
	if (ext === 'xy') {
		return 'An OP-XY project: the agent cannot read project files yet.';
	}
	if (
		['doc', 'docx', 'pages', 'rtf', 'odt', 'xls', 'xlsx', 'numbers', 'key', 'ppt', 'pptx'].includes(
			ext
		)
	) {
		return 'An office document: export it as PDF and attach that.';
	}
	return 'Not a file the agent can read: it takes images, PDFs, MIDI files and text files.';
}

/** Visual tokens of an image: one per 28 × 28 px patch. */
export function imageTokens(width: number, height: number): number {
	return Math.ceil(width / 28) * Math.ceil(height / 28);
}

/**
 * The size to send an image at: the largest that fits `maxEdge` on its long side and `maxTokens`
 * visual tokens, never larger than the original.
 */
export function fitImage(
	width: number,
	height: number,
	maxEdge: number = ATTACHMENT_LIMITS.imageEdge,
	maxTokens: number = ATTACHMENT_LIMITS.imageTokens
): { width: number; height: number } {
	let scale = Math.min(
		1,
		maxEdge / Math.max(width, height),
		Math.sqrt((maxTokens * 784) / (width * height))
	);
	const size = () => ({
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	});
	let out = size();
	while (imageTokens(out.width, out.height) > maxTokens) {
		scale *= 0.99;
		out = size();
	}
	return out;
}

/** Base64 of bytes (chunked, so large files don't overflow the argument list). */
export function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/** "2.1 MB", "340 KB", "812 B". */
export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

/** Pages of a PDF, when its page objects can be counted without decompressing; else null. */
export function countPdfPages(latin1: string): number | null {
	const pages = latin1.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
	if (pages > 0) return pages;
	let count = 0;
	for (const match of latin1.matchAll(
		/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g
	)) {
		count = Math.max(count, Number(match[1] ?? match[2]));
	}
	return count > 0 ? count : null;
}

/** Text as the model gets it: no BOM, Unix line ends, cut at `max` characters. */
export function prepareText(
	raw: string,
	max: number = ATTACHMENT_LIMITS.textChars
): { text: string; lines: number; truncated: boolean } {
	const clean = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const truncated = clean.length > max;
	const text = truncated ? clean.slice(0, max) : clean;
	const lines = text.length === 0 ? 0 : text.split('\n').length;
	return { text, lines, truncated };
}

/** The user message's content: the files first (the model reads best that way), then the text. */
export function userContent(
	text: string,
	attachments: readonly PreparedAttachment[]
): BetaContentBlockParam[] {
	const blocks: BetaContentBlockParam[] = attachments.flatMap((a) => [...a.blocks]);
	if (text) blocks.push({ type: 'text', text });
	return blocks;
}

/** Characters of file data (base64 and document text) in a transcript. */
export function transcriptFileBytes(messages: readonly BetaMessageParam[]): number {
	let bytes = 0;
	for (const message of messages) {
		if (typeof message.content === 'string') continue;
		for (const block of message.content) {
			if (block.type === 'image' && block.source.type === 'base64') {
				bytes += block.source.data.length;
			} else if (
				block.type === 'document' &&
				(block.source.type === 'base64' || block.source.type === 'text')
			) {
				bytes += block.source.data.length;
			}
		}
	}
	return bytes;
}

/** Why these files cannot go with the next message of this conversation, or null. */
export function attachmentProblem(
	messages: readonly BetaMessageParam[],
	attachments: readonly PreparedAttachment[]
): string | null {
	if (attachments.length > ATTACHMENT_LIMITS.perMessage) {
		return `Up to ${ATTACHMENT_LIMITS.perMessage} files per message.`;
	}
	const adding = attachments.reduce((sum, a) => sum + a.bytes, 0);
	if (adding === 0) return null;
	if (transcriptFileBytes(messages) + adding > ATTACHMENT_LIMITS.conversationBytes) {
		return 'These files would make the conversation too large to send: every message carries the whole conversation, files included, and the API takes 32 MB. Start a new conversation for them, or send fewer or smaller files.';
	}
	return null;
}

let idCounter = 0;

/** A unique id for an attachment. */
export function attachmentId(): string {
	return `file-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

// ─── preparing files (browser) ──────────────────────────────────────────────────────────────────

interface Decoded {
	readonly width: number;
	readonly height: number;
	readonly source: CanvasImageSource;
	close(): void;
}

async function decodeImage(file: Blob): Promise<Decoded> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
			return {
				width: bitmap.width,
				height: bitmap.height,
				source: bitmap,
				close: () => bitmap.close()
			};
		} catch {
			// SVG and a few other formats decode only through an <img>.
		}
	}
	if (typeof Image === 'undefined') throw new AttachmentError('Could not be opened as an image.');
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		// An SVG without a size of its own gets a page-shaped one.
		const width = img.naturalWidth || 1600;
		const height = img.naturalHeight || Math.round(width * 1.294);
		return { width, height, source: img, close: () => URL.revokeObjectURL(url) };
	} catch {
		URL.revokeObjectURL(url);
		throw new AttachmentError('Could not be opened as an image. Try saving it as PNG or JPEG.');
	}
}

/** Draws the image on white paper at `width` × `height` and encodes it. */
async function render(
	image: Decoded,
	width: number,
	height: number,
	type: 'image/png' | 'image/jpeg',
	quality?: number
): Promise<Uint8Array> {
	let blob: Blob;
	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(width, height);
		paint(canvas.getContext('2d'), image, width, height);
		blob = await canvas.convertToBlob({ type, quality });
	} else {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		paint(canvas.getContext('2d'), image, width, height);
		blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encoding failed'))), type, quality)
		);
	}
	return new Uint8Array(await blob.arrayBuffer());
}

function paint(
	ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null,
	image: Decoded,
	width: number,
	height: number
): void {
	if (!ctx) throw new AttachmentError('This browser cannot draw images.');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, height);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(image.source, 0, 0, width, height);
}

async function prepareImage(file: File, id: string): Promise<PreparedAttachment> {
	const image = await decodeImage(file);
	try {
		const { width, height } = fitImage(image.width, image.height);
		const lineArt = LINE_ART.test(file.type) || /\.(png|gif|webp|bmp|svg)$/i.test(file.name);
		let mediaType: 'image/png' | 'image/jpeg' = lineArt ? 'image/png' : 'image/jpeg';
		let bytes = await render(image, width, height, mediaType, lineArt ? undefined : 0.9);
		if (bytes.length > ATTACHMENT_LIMITS.imageBytes && lineArt) {
			mediaType = 'image/jpeg';
			bytes = await render(image, width, height, mediaType, 0.92);
		}
		if (bytes.length > ATTACHMENT_LIMITS.imageBytes) {
			throw new AttachmentError('Too detailed to send, even scaled down.');
		}
		const thumbSize = fitImage(image.width, image.height, ATTACHMENT_LIMITS.thumbEdge, Infinity);
		const thumb = await render(image, thumbSize.width, thumbSize.height, 'image/jpeg', 0.8);
		const data = toBase64(bytes);
		const block: BetaImageBlockParam = {
			type: 'image',
			source: { type: 'base64', media_type: mediaType, data }
		};
		return {
			view: {
				id,
				kind: 'image',
				name: file.name,
				size: file.size,
				detail: `${width} × ${height}`,
				thumb: `data:image/jpeg;base64,${toBase64(thumb)}`
			},
			blocks: [{ type: 'text', text: `Image “${file.name}” (${width} × ${height} px):` }, block],
			bytes: data.length
		};
	} finally {
		image.close();
	}
}

async function preparePdf(file: File, id: string): Promise<PreparedAttachment> {
	if (file.size > ATTACHMENT_LIMITS.pdfBytes) {
		throw new AttachmentError(
			`${formatBytes(file.size)}; PDFs can be up to ${formatBytes(ATTACHMENT_LIMITS.pdfBytes)}. Export only the pages you need.`
		);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const latin1 = new TextDecoder('latin1').decode(bytes);
	if (!latin1.startsWith('%PDF-')) throw new AttachmentError('Not a valid PDF.');
	if (/\/Encrypt\b/.test(latin1)) {
		throw new AttachmentError('Password-protected: the agent can only read open PDFs.');
	}
	const pages = countPdfPages(latin1);
	if (pages !== null && pages > ATTACHMENT_LIMITS.pdfPages) {
		throw new AttachmentError(
			`${pages} pages; the agent reads up to ${ATTACHMENT_LIMITS.pdfPages}. Export only the pages you need.`
		);
	}
	const data = toBase64(bytes);
	return {
		view: {
			id,
			kind: 'pdf',
			name: file.name,
			size: file.size,
			detail: pages !== null ? `${pages} page${pages === 1 ? '' : 's'}` : formatBytes(file.size)
		},
		blocks: [
			{
				type: 'document',
				source: { type: 'base64', media_type: 'application/pdf', data },
				title: file.name
			}
		],
		bytes: data.length
	};
}

async function prepareMidi(file: File, id: string): Promise<PreparedAttachment> {
	// The MIDI reader loads with the first MIDI file, not with the page.
	const { describeMidiFile } = await import('./midi-text');
	let described: MidiText;
	try {
		described = describeMidiFile(await file.arrayBuffer(), file.name, ATTACHMENT_LIMITS.midiNotes);
	} catch (error) {
		const name = error instanceof Error ? error.name : '';
		if (name === 'SmfFormatError' || name === 'MidiRangeError' || error instanceof RangeError) {
			throw new AttachmentError('Not a valid MIDI file.');
		}
		throw error;
	}
	return {
		view: { id, kind: 'midi', name: file.name, size: file.size, detail: described.detail },
		blocks: [
			{
				type: 'document',
				source: { type: 'text', media_type: 'text/plain', data: described.text },
				title: file.name,
				context: 'A MIDI file the user attached, listed note for note by the app.'
			}
		],
		bytes: described.text.length
	};
}

async function prepareTextFile(file: File, id: string): Promise<PreparedAttachment> {
	const raw = await file.text();
	if (raw.slice(0, 4096).includes('\u0000')) {
		throw new AttachmentError('Does not look like a text file.');
	}
	const { text, lines, truncated } = prepareText(raw);
	if (text.trim().length === 0) throw new AttachmentError('The file is empty.');
	return {
		view: {
			id,
			kind: 'text',
			name: file.name,
			size: file.size,
			detail: `${lines} line${lines === 1 ? '' : 's'}${truncated ? ' (cut)' : ''}`
		},
		blocks: [
			{
				type: 'document',
				source: { type: 'text', media_type: 'text/plain', data: text },
				title: file.name,
				...(truncated
					? { context: `Only the first ${ATTACHMENT_LIMITS.textChars} characters of the file.` }
					: {})
			}
		],
		bytes: text.length
	};
}

/**
 * Prepares one file for the agent (browser only: images need a canvas). Throws `AttachmentError`
 * with a sentence for the user when the file cannot go.
 */
export async function prepareAttachment(
	file: File,
	id = attachmentId()
): Promise<PreparedAttachment> {
	const kind = attachmentKind(file.name, file.type);
	if (kind === null) throw new AttachmentError(unsupportedReason(file.name, file.type));
	if (file.size === 0) throw new AttachmentError('The file is empty.');
	if (file.size > ATTACHMENT_LIMITS.fileBytes) {
		throw new AttachmentError(`${formatBytes(file.size)}: too large to attach.`);
	}
	switch (kind) {
		case 'image':
			return prepareImage(file, id);
		case 'pdf':
			return preparePdf(file, id);
		case 'midi':
			return prepareMidi(file, id);
		case 'text':
			return prepareTextFile(file, id);
	}
}
