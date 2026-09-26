// The app has exactly one device stack (one Web MIDI connection, one transport — the single send
// choke point). The root layout creates it and every page reads it from this context.
import { createContext } from 'svelte';
import type { DeviceStack } from './stack';

/** Typed context for the app-wide {@link DeviceStack}. */
export const [getDeviceStack, setDeviceStack] = createContext<DeviceStack>();
