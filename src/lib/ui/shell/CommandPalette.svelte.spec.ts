// The command palette: ⌘K opens it with its field focused and the suggested commands listed,
// typing narrows them, the arrows choose and enter runs; esc closes it and focus goes back, as a
// click outside it does.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import CommandPalette from './CommandPalette.svelte';
import type { PaletteCommand } from './palette';
import { PaletteState } from './palette-state.svelte';

function setup() {
	const ran: string[] = [];
	const command = (label: string, extra: Partial<PaletteCommand> = {}): PaletteCommand => ({
		id: label,
		label,
		group: 'replica',
		run: () => ran.push(label),
		...extra
	});
	const palette = new PaletteState();
	let shown = 0;
	palette.onShow(() => shown++);
	palette.add((query) => [
		command('play', { suggest: true, hint: 'space' }),
		command('show the display large', { suggest: true, keywords: 'screen big' }),
		command('metronome on'),
		...(query.trim()
			? [command(`ask “${query.trim()}”`, { id: 'ask', group: 'agent', score: 0.3 })]
			: [])
	]);
	const screen = render(CommandPalette, { palette });
	return { palette, screen, ran, shown: () => shown };
}

const options = () =>
	[...document.querySelectorAll('[role=option]')].map((o) => ({
		label: o.querySelector('.row__label')?.textContent,
		selected: o.getAttribute('aria-selected') === 'true'
	}));

describe('the command palette', () => {
	it('opens on ⌘K with its field focused, the suggested commands listed', async () => {
		const { screen, palette, shown } = setup();
		const before = document.createElement('button');
		document.body.append(before);
		before.focus();
		expect(palette.open).toBe(false);
		await userEvent.keyboard('{Meta>}k{/Meta}');
		const field = screen.getByRole('combobox', { name: 'command or question' });
		await expect.element(field).toHaveFocus();
		expect(shown()).toBe(1);
		expect(options()).toEqual([
			{ label: 'play', selected: true },
			{ label: 'show the display large', selected: false }
		]);
		await userEvent.keyboard('{Escape}');
		expect(palette.open).toBe(false);
		// focus goes back where it was
		await expect.poll(() => document.activeElement).toBe(before);
		before.remove();
	});

	it('narrows to what is typed; the arrows choose and enter runs', async () => {
		const { screen, palette, ran } = setup();
		palette.show();
		const field = screen.getByRole('combobox');
		await userEvent.fill(field, 'big');
		await expect.poll(options).toEqual([
			{ label: 'show the display large', selected: true },
			{ label: 'ask “big”', selected: false }
		]);
		await userEvent.keyboard('{ArrowDown}');
		expect(options()[1].selected).toBe(true);
		await userEvent.keyboard('{ArrowDown}');
		expect(options()[0].selected).toBe(true);
		await userEvent.keyboard('{ArrowUp}{Enter}');
		expect(ran).toEqual(['ask “big”']);
		expect(palette.open).toBe(false);
		// the next opening starts empty
		palette.show();
		await expect.element(screen.getByRole('combobox')).toHaveValue('');
	});

	it('runs a row clicked, and closes on a click outside it', async () => {
		const { screen, palette, ran } = setup();
		palette.show();
		// not suggested, so not there until typed
		await expect.element(screen.getByRole('option', { name: /metronome/ })).not.toBeInTheDocument();
		await userEvent.fill(screen.getByRole('combobox'), 'metro');
		await screen.getByRole('option', { name: /metronome on/ }).click();
		expect(ran).toEqual(['metronome on']);
		palette.show();
		await expect.element(screen.getByRole('dialog', { name: 'commands' })).toBeVisible();
		const backdrop = document.querySelector('.palette') as HTMLElement;
		backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(palette.open).toBe(false);
	});
});
