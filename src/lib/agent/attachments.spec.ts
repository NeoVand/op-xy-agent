import { describe, expect, it } from 'vitest';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { writeMidiFile } from '$lib/core/midi/smf';
import {
	ATTACHMENT_LIMITS,
	AttachmentError,
	attachmentKind,
	attachmentProblem,
	countPdfPages,
	fitImage,
	imageTokens,
	prepareAttachment,
	prepareText,
	toBase64,
	transcriptFileBytes,
	unsupportedReason,
	userContent,
	type PreparedAttachment
} from './attachments';

/** A minimal one-page PDF. */
const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;

function fakeAttachment(bytes: number, name = 'a.png'): PreparedAttachment {
	return {
		view: { id: name, kind: 'image', name, size: bytes, detail: '' },
		blocks: [
			{
				type: 'image',
				source: { type: 'base64', media_type: 'image/png', data: 'x'.repeat(bytes) }
			}
		],
		bytes
	};
}

describe('attachmentKind', () => {
	it('recognises images, PDFs, MIDI and text by name or type', () => {
		expect(attachmentKind('score.JPG', '')).toBe('image');
		expect(attachmentKind('paste', 'image/png')).toBe('image');
		expect(attachmentKind('score.svg', 'image/svg+xml')).toBe('image');
		expect(attachmentKind('score.pdf', '')).toBe('pdf');
		expect(attachmentKind('x', 'application/pdf')).toBe('pdf');
		expect(attachmentKind('song.mid', '')).toBe('midi');
		expect(attachmentKind('song', 'audio/midi')).toBe('midi');
		expect(attachmentKind('song.MIDI', 'audio/x-midi')).toBe('midi');
		expect(attachmentKind('tune.abc', '')).toBe('text');
		expect(attachmentKind('score.musicxml', 'application/vnd.recordare.musicxml+xml')).toBe('text');
		expect(attachmentKind('chords.txt', 'text/plain')).toBe('text');
		expect(attachmentKind('data', 'application/json')).toBe('text');
	});

	it('refuses what the agent cannot read, and says what to do instead', () => {
		expect(attachmentKind('photo.HEIC', 'image/heic')).toBeNull();
		expect(unsupportedReason('photo.HEIC', 'image/heic')).toMatch(/JPEG/);
		expect(attachmentKind('song.wav', 'audio/wav')).toBeNull();
		expect(unsupportedReason('song.wav', 'audio/wav')).toMatch(/cannot listen/);
		expect(attachmentKind('score.mxl', '')).toBeNull();
		expect(unsupportedReason('score.mxl', '')).toMatch(/uncompressed MusicXML/);
		expect(unsupportedReason('notes.docx', '')).toMatch(/PDF/);
		expect(unsupportedReason('song.xy', '')).toMatch(/project/);
		expect(unsupportedReason('thing.bin', '')).toMatch(/images, PDFs, MIDI files and text/);
	});
});

describe('fitImage', () => {
	it('keeps images that already fit as they are', () => {
		expect(fitImage(1000, 1000)).toEqual({ width: 1000, height: 1000 });
		expect(fitImage(200, 120)).toEqual({ width: 200, height: 120 });
	});

	it('fits the long edge and the visual-token budget, keeping the aspect ratio', () => {
		for (const [w, h] of [
			[4032, 3024],
			[3024, 4032],
			[2480, 3508],
			[8000, 1000],
			[1920, 1080]
		]) {
			const out = fitImage(w, h);
			expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(ATTACHMENT_LIMITS.imageEdge);
			expect(imageTokens(out.width, out.height)).toBeLessThanOrEqual(ATTACHMENT_LIMITS.imageTokens);
			expect(out.width / out.height).toBeCloseTo(w / h, 1);
			// Not needlessly small: within a few percent of the budget or the edge.
			const tokens = imageTokens(out.width, out.height) / ATTACHMENT_LIMITS.imageTokens;
			const edge = Math.max(out.width, out.height) / ATTACHMENT_LIMITS.imageEdge;
			expect(Math.max(tokens, edge)).toBeGreaterThan(0.93);
		}
	});

	it('counts visual tokens in 28-pixel patches', () => {
		expect(imageTokens(28, 28)).toBe(1);
		expect(imageTokens(29, 28)).toBe(2);
		expect(imageTokens(1000, 1000)).toBe(1296);
	});
});

describe('helpers', () => {
	it('encodes base64 like the platform, in chunks', () => {
		const bytes = new Uint8Array(100_000).map((_, i) => (i * 7919) % 256);
		expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
	});

	it('counts PDF pages when the page objects are readable', () => {
		expect(countPdfPages(PDF)).toBe(1);
		expect(countPdfPages('%PDF-1.7 << /Type /Pages /Count 12 >>')).toBe(12);
		expect(countPdfPages('%PDF-1.7 compressed')).toBeNull();
	});

	it('cleans and cuts text', () => {
		expect(prepareText('\uFEFFa\r\nb\rc')).toEqual({ text: 'a\nb\nc', lines: 3, truncated: false });
		expect(prepareText('abcdef', 4)).toEqual({ text: 'abcd', lines: 1, truncated: true });
	});
});

describe('the message content', () => {
	it('puts the files first, then the text', () => {
		const file = fakeAttachment(3);
		expect(userContent('play this', [file])).toEqual([
			...file.blocks,
			{ type: 'text', text: 'play this' }
		]);
		expect(userContent('', [file])).toEqual([...file.blocks]);
		expect(userContent('hi', [])).toEqual([{ type: 'text', text: 'hi' }]);
	});

	it('counts file data in a transcript and refuses what would not fit a request', () => {
		const messages: BetaMessageParam[] = [
			{ role: 'user', content: userContent('a', [fakeAttachment(1000)]) },
			{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
			{
				role: 'user',
				content: [
					{
						type: 'document',
						source: { type: 'text', media_type: 'text/plain', data: 'abc' },
						title: 't.txt'
					}
				]
			}
		];
		expect(transcriptFileBytes(messages)).toBe(1003);
		expect(attachmentProblem(messages, [fakeAttachment(10)])).toBeNull();
		expect(
			attachmentProblem(messages, [fakeAttachment(ATTACHMENT_LIMITS.conversationBytes)])
		).toMatch(/too large/);
		const many = Array.from({ length: ATTACHMENT_LIMITS.perMessage + 1 }, (_, i) =>
			fakeAttachment(1, `${i}.png`)
		);
		expect(attachmentProblem([], many)).toMatch(/Up to 10 files/);
	});
});

describe('prepareAttachment', () => {
	it('sends a PDF as a document block with its page count', async () => {
		const file = new File([PDF], 'score.pdf', { type: 'application/pdf' });
		const ready = await prepareAttachment(file, 'f1');
		expect(ready.view).toEqual({
			id: 'f1',
			kind: 'pdf',
			name: 'score.pdf',
			size: file.size,
			detail: '1 page'
		});
		expect(ready.blocks).toEqual([
			{
				type: 'document',
				source: {
					type: 'base64',
					media_type: 'application/pdf',
					data: toBase64(new TextEncoder().encode(PDF))
				},
				title: 'score.pdf'
			}
		]);
		expect(ready.bytes).toBe((ready.blocks[0] as { source: { data: string } }).source.data.length);
	});

	it('refuses broken and locked PDFs', async () => {
		await expect(
			prepareAttachment(new File(['hello'], 'x.pdf', { type: 'application/pdf' }))
		).rejects.toThrow(/not a valid PDF/i);
		await expect(prepareAttachment(new File([`${PDF}\n/Encrypt 5 0 R`], 'x.pdf'))).rejects.toThrow(
			/password-protected/i
		);
	});

	it('sends a MIDI file as its note list', async () => {
		const bytes = writeMidiFile([
			{
				name: 'Lead',
				events: [
					{ tick: 0, event: { type: 'noteOn', channel: 0, note: 60, velocity: 90 } },
					{ tick: 480, event: { type: 'noteOff', channel: 0, note: 60, velocity: 0 } }
				]
			}
		]);
		const ready = await prepareAttachment(new File([new Uint8Array(bytes)], 'tune.mid'), 'f2');
		expect(ready.view.kind).toBe('midi');
		expect(ready.view.detail).toBe('2 tracks · 1 note · 0:01');
		const block = ready.blocks[0] as {
			type: string;
			source: { type: string; data: string };
			title: string;
			context: string;
		};
		expect(block.type).toBe('document');
		expect(block.source.type).toBe('text');
		expect(block.source.data).toContain('1 0 C4 1 90');
		expect(block.title).toBe('tune.mid');
		expect(block.context).toMatch(/note for note/);
		await expect(prepareAttachment(new File(['nope'], 'bad.mid'))).rejects.toThrow(
			/not a valid MIDI file/i
		);
	});

	it('sends text as a plain-text document, cut when very long', async () => {
		const ready = await prepareAttachment(new File(['X:1\nK:C\nCDEF|'], 'tune.abc'), 'f3');
		expect(ready.view.detail).toBe('3 lines');
		expect(ready.blocks).toEqual([
			{
				type: 'document',
				source: { type: 'text', media_type: 'text/plain', data: 'X:1\nK:C\nCDEF|' },
				title: 'tune.abc'
			}
		]);
		const long = await prepareAttachment(
			new File(['a'.repeat(ATTACHMENT_LIMITS.textChars + 10)], 'long.txt')
		);
		expect(long.view.detail).toBe('1 line (cut)');
		expect(long.bytes).toBe(ATTACHMENT_LIMITS.textChars);
	});

	it('refuses empty, binary and unsupported files with a reason', async () => {
		await expect(prepareAttachment(new File([], 'empty.txt'))).rejects.toThrow(/empty/);
		await expect(prepareAttachment(new File(['a\u0000b'], 'bin.txt'))).rejects.toThrow(
			/not look like a text file/
		);
		const error = await prepareAttachment(
			new File(['x'], 'song.mp3', { type: 'audio/mpeg' })
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AttachmentError);
		expect((error as Error).message).toMatch(/cannot listen/);
	});
});
