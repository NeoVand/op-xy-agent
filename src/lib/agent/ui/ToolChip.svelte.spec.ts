// A tool chip in a real browser: a lab program's chip says its purpose, and opens on its code as it
// reads (lines, not an escaped JSON string), after its other fields; other tools show their input.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatEntry } from '../chat';
import ToolChip from './ToolChip.svelte';

type ToolEntry = Extract<ChatEntry, { kind: 'tool' }>;

const entry = (name: string, input: unknown, summary = ''): ToolEntry => ({
	kind: 'tool',
	id: `toolu_${name}`,
	agent: 'conductor',
	parent: null,
	name,
	label: name.replace('_', ' '),
	toolKind: 'mutate',
	status: 'ok',
	input,
	summary
});

describe('ToolChip', () => {
	it('shows a lab program as code', async () => {
		const code = 'const f = lab.fork();\nf.setTempo(96);\nreturn f.status().bpm;';
		const screen = await render(ToolChip, {
			props: { entry: entry('run_lab', { purpose: 'slower', code, timeout_s: 5 }) }
		});
		const pre = screen.container.querySelector('.chip__input');
		expect(screen.container.querySelector('.chip__summary')?.textContent).toBe('slower');
		expect(pre?.textContent).toContain('\nconst f = lab.fork();\nf.setTempo(96);\n');
		expect(pre?.textContent).toContain('"purpose": "slower"');
		expect(pre?.textContent).not.toContain('\\n');
	});

	it('shows other tools’ input as JSON', async () => {
		const screen = await render(ToolChip, {
			props: { entry: entry('set_tempo', { bpm: 96 }, 'tempo 96 bpm') }
		});
		expect(screen.container.querySelector('.chip__input')?.textContent).toBe('{\n "bpm": 96\n}');
	});
});
