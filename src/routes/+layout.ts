// Everything is prerendered to static HTML (adapter-static, no server). Browser-only APIs such as
// Web MIDI must be touched in onMount/$effect or behind `browser` checks, never at import time.
export const prerender = true;
