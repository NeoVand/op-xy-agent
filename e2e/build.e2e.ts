import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// What the build ships in its workers. The lab's sandbox runs the simulator, whose state is a
// rune: worker bundles do not get the page's plugins, and one built without the Svelte compiler
// shipped `$state(` raw, so every lab.fork() threw "$state is not defined" on the published site
// while the dev server (which compiles them) worked (`vite.config.ts`, worker.plugins).
test('the workers carry no uncompiled runes', () => {
	const dir = 'build/_app/immutable/workers';
	const files = readdirSync(dir).filter((file) => file.endsWith('.js'));
	expect(files.length).toBeGreaterThan(0);
	for (const file of files) {
		const code = readFileSync(`${dir}/${file}`, 'utf8');
		const raw = /\$(state|derived|effect)(\.\w+)?\(/.exec(code);
		// on failure, the code round the rune rather than the whole bundle
		const around = raw ? code.slice(Math.max(0, raw.index - 80), raw.index + 80) : null;
		expect(around, file).toBeNull();
	}
});
