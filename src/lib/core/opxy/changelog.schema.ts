import { z } from 'zod';
import { FirmwareVersionStringSchema } from './common.schema';

/** One MIDI/USB-relevant firmware change, paraphrased (`knowledge/firmware/changelog-midi-usb.json`). */
export const ChangelogItemSchema = z.looseObject({
	version: FirmwareVersionStringSchema,
	date: z.iso.date(),
	area: z.string().regex(/^[a-z][a-z-]*$/),
	summary: z.string().min(1)
});

/** Schema of `knowledge/firmware/changelog-midi-usb.json`. Items must be in release order. */
export const ChangelogFileSchema = z
	.looseObject({ items: z.array(ChangelogItemSchema).min(1) })
	.superRefine((file, ctx) => {
		for (let i = 1; i < file.items.length; i++) {
			if (file.items[i].date < file.items[i - 1].date) {
				ctx.addIssue({
					code: 'custom',
					path: ['items', i, 'date'],
					message: 'items must be in release order'
				});
			}
		}
	});

/** One validated changelog item. */
export type ChangelogItem = z.infer<typeof ChangelogItemSchema>;
/** The validated changelog file. */
export type ChangelogFile = z.infer<typeof ChangelogFileSchema>;
