import { defineConfig } from '@playwright/test';

/** A port of its own, so a preview left running elsewhere (vite's 4173) never answers the tests. */
const PORT = Number(process.env.E2E_PORT ?? 4199);

export default defineConfig({
	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
		port: PORT
	},
	use: { baseURL: `http://localhost:${PORT}` },
	testMatch: '**/*.e2e.{ts,js}'
});
