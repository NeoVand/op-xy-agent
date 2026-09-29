// A combo drawn as the device's keys: one picture per key, the combo said the way the manual writes
// it, code for anything that does not parse, and the keys under the pointer reported for ringing.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ControlId } from '$lib/core/opxy';
import KeyCombo from './KeyCombo.svelte';

describe('KeyCombo', () => {
	it('draws each key and says the combo as the manual writes it', async () => {
		const screen = render(KeyCombo, { keys: 'record + play → play' });
		await expect
			.element(screen.getByRole('img', { name: 'record + play, then play' }))
			.toBeVisible();
		const glyphs = screen.container.querySelectorAll('svg.glyph');
		expect(glyphs.length).toBe(3);
		expect([...glyphs].map((g) => g.getAttribute('aria-label'))).toEqual([
			'record',
			'play',
			'play'
		]);
		expect(screen.container.textContent).toContain('→');
	});

	it('draws a turned encoder with its arrows and keeps the gesture word', () => {
		const screen = render(KeyCombo, { keys: 'shift + turn E2' });
		expect(screen.container.querySelector('.glyph--encoder .glyph__turn')).not.toBeNull();
		expect(screen.container.querySelector('.combo__word')?.textContent).toBe('turn');
	});

	it('shows what does not parse as code', () => {
		const screen = render(KeyCombo, { keys: 'hold banana' });
		expect(screen.container.querySelector('code')?.textContent).toBe('hold banana');
		expect(screen.container.querySelector('svg')).toBeNull();
	});

	it('reports the key under the pointer, the whole combo elsewhere, and nothing after', async () => {
		const pointed: (readonly ControlId[] | null)[] = [];
		const screen = render(KeyCombo, {
			keys: 'shift + M1',
			onpoint: (ids) => pointed.push(ids)
		});
		const keys = screen.container.querySelectorAll('.combo__key');
		keys[1].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		screen.container
			.querySelector('.combo__join')
			?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		screen.container
			.querySelector('.combo')
			?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
		expect(pointed).toEqual([['key.m1'], ['key.shift', 'key.m1'], null]);
	});
});
