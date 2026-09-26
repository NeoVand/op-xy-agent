/** Shared types for the UI primitives in `src/lib/ui`. */

/** The four LED states the OP-XY uses. */
export type LedState = 'off' | 'dim' | 'white' | 'red';

/** Encoder number, left to right: 1 dark grey, 2 mid grey, 3 light grey, 4 white. */
export type EncoderNumber = 1 | 2 | 3 | 4;

/**
 * Key emphasis. Emphasis climbs the grey ramp like the step row does:
 * `key` is a dark key, `secondary` a mid-grey key, `primary` the light key (use once per view),
 * `ghost` a legend with no cap.
 */
export type KeyVariant = 'key' | 'secondary' | 'primary' | 'ghost';

/** Control size. */
export type KeySize = 'sm' | 'md' | 'lg';

/** Surfaces a panel can be made of. */
export type PanelVariant = 'plate' | 'screen' | 'card' | 'sunken';
