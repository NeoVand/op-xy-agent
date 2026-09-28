/**
 * Design system v0: tokens live in `tokens.css` (imported once by src/routes/layout.css); rules and
 * rationale in docs/DESIGN.md. Import primitives from here: `import { Button } from '$lib/ui';`.
 */
export { default as Button } from './Button.svelte';
export { default as Divider } from './Divider.svelte';
export { default as EncoderDot } from './EncoderDot.svelte';
export { default as HugeIcon } from './HugeIcon.svelte';
export { default as Icon } from './Icon.svelte';
export { default as IconButton } from './IconButton.svelte';
export { default as Kbd } from './Kbd.svelte';
export { default as Led } from './Led.svelte';
export { default as Legend } from './Legend.svelte';
export { default as Panel } from './Panel.svelte';
export { default as Readout } from './Readout.svelte';
export { default as Switch } from './Switch.svelte';

export { icons, type IconName, type IconShape } from './icons';
export { parseCombo, type ComboPart, type KeyGlyph } from './kbd';
export { Theme, getTheme, setTheme, THEME_STORAGE_KEY, type ThemeName } from './theme.svelte';
export { tooltip, type TooltipOptions } from './tooltip';
export type { EncoderNumber, KeySize, KeyVariant, LedState, PanelVariant } from './types';
