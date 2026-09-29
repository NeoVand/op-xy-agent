import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	// Honour a PORT handed to us by the harness; fall back to Vite's default.
	server: {
		port: Number(process.env.PORT) || 5173,
		// agent worktrees are whole copies of the repo inside it: never watch or serve from them
		watch: { ignored: ['**/.claude/worktrees/**'] },
		// the dev-only transcript viewer (?transcripts=1) reads saved agent evals from here
		fs: { allow: ['evals/agent/out'] }
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// fallback: unknown paths get the SPA shell (GitHub Pages serves 404.html)
			adapter: adapter({ fallback: '404.html' }),
			// GitHub Pages serves the site under /<repo>; CI sets BASE_PATH, local dev leaves it empty
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` },
			alias: { $knowledge: 'knowledge' }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					// the browser tests cannot read the environment: tell them when they run on CI
					provide: { ci: Boolean(process.env.CI) },
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// the synth's DSP tests run several times slower on CI's shared runners
					testTimeout: process.env.CI ? 30_000 : 5_000,
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
