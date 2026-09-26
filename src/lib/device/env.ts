/**
 * The real browser behind the device layer's injected interfaces. Nothing here runs at import: each
 * member reads browser globals only when called, so these can be referenced from code that also
 * runs during prerendering. Call `browserAccessEnvironment()` in the browser only (`onMount`).
 */
import type {
	AccessEnvironment,
	Clock,
	FrameScheduler,
	PermissionStateLike,
	RequestMidiAccess,
	Timers
} from './types';

/** `performance.now()`, the domain Web MIDI timestamps use. */
export const browserClock: Clock = {
	now: () => performance.now()
};

/** The window's timers. */
export const browserTimers: Timers = {
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Animation frames. */
export const browserFrames: FrameScheduler = {
	request: (callback) => requestAnimationFrame(callback),
	cancel: (handle) => cancelAnimationFrame(handle as number)
};

/** Web MIDI and permissions as this browser offers them. */
export function browserAccessEnvironment(): AccessEnvironment {
	const nav = globalThis.navigator;
	const requestMIDIAccess: RequestMidiAccess | null =
		nav && 'requestMIDIAccess' in nav ? (options) => nav.requestMIDIAccess(options) : null;
	return {
		requestMIDIAccess,
		secureContext: globalThis.isSecureContext === true,
		userAgent: nav?.userAgent ?? '',
		queryPermission: async (sysex) => {
			if (!nav?.permissions) return null;
			// `sysex` is part of the MIDI permission descriptor, which TypeScript's DOM types lack.
			const descriptor: PermissionDescriptor & { sysex: boolean } = { name: 'midi', sysex };
			try {
				const status = await nav.permissions.query(descriptor);
				return status.state as PermissionStateLike;
			} catch {
				// Firefox and others do not know the "midi" permission name.
				return null;
			}
		}
	};
}

/** Whether the current call happens during a user gesture (for confirmation tokens). */
export function browserUserActivation(): boolean {
	return globalThis.navigator?.userActivation?.isActive ?? false;
}
