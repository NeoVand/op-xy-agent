import { describe, expect, it } from 'vitest';
import { ATTACHMENT_LIMITS, imageTokens, prepareAttachment } from './attachments';

/** A picture drawn in the browser: a black bar on a transparent (or coloured) ground. */
async function picture(
	width: number,
	height: number,
	type: 'image/png' | 'image/jpeg',
	ground: string | null
): Promise<Blob> {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d')!;
	if (ground) {
		ctx.fillStyle = ground;
		ctx.fillRect(0, 0, width, height);
	}
	ctx.fillStyle = '#000';
	ctx.fillRect(width * 0.25, height * 0.4, width * 0.5, height * 0.2);
	return canvas.convertToBlob({ type, quality: 0.9 });
}

/** Decodes a base64 image and reads one pixel. */
async function pixel(data: string, type: string, x: number, y: number): Promise<number[]> {
	const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
	const bitmap = await createImageBitmap(new Blob([bytes], { type }));
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0);
	return [...ctx.getImageData(x, y, 1, 1).data];
}

describe('prepareAttachment: images (in the browser)', () => {
	it('scales a large screenshot into the budget, keeps it PNG and puts it on white paper', async () => {
		const file = new File([await picture(4000, 1000, 'image/png', null)], 'score.png', {
			type: 'image/png'
		});
		const ready = await prepareAttachment(file, 'img1');
		expect(ready.view.kind).toBe('image');
		expect(ready.view.detail).toBe('2000 × 500');
		expect(ready.view.thumb).toMatch(/^data:image\/jpeg;base64,/);
		const [label, block] = ready.blocks as [
			{ type: 'text'; text: string },
			{ type: 'image'; source: { media_type: string; data: string } }
		];
		expect(label).toEqual({ type: 'text', text: 'Image “score.png” (2000 × 500 px):' });
		expect(block.type).toBe('image');
		expect(block.source.media_type).toBe('image/png');
		expect(ready.bytes).toBe(block.source.data.length);
		expect(imageTokens(2000, 500)).toBeLessThanOrEqual(ATTACHMENT_LIMITS.imageTokens);
		// The transparent corner became white; the bar stayed black.
		expect(await pixel(block.source.data, 'image/png', 5, 5)).toEqual([255, 255, 255, 255]);
		expect((await pixel(block.source.data, 'image/png', 1000, 250)).slice(0, 3)).toEqual([0, 0, 0]);
	});

	it('sends photos as JPEG and leaves small images at their size', async () => {
		const file = new File([await picture(900, 600, 'image/jpeg', '#c0a080')], 'photo.jpg', {
			type: 'image/jpeg'
		});
		const ready = await prepareAttachment(file, 'img2');
		expect(ready.view.detail).toBe('900 × 600');
		const block = ready.blocks[1] as { source: { media_type: string } };
		expect(block.source.media_type).toBe('image/jpeg');
	});

	it('refuses a file that is not really an image', async () => {
		const file = new File(['not an image'], 'fake.png', { type: 'image/png' });
		await expect(prepareAttachment(file)).rejects.toThrow(/could not be opened as an image/i);
	});
});
