// What vite.config.ts provides to the tests, read with vitest's `inject`.
declare module 'vitest' {
	export interface ProvidedContext {
		/** The tests are running on CI's shared runners. */
		ci: boolean;
	}
}

export {};
