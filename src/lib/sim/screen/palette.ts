/**
 * The screen's geometry and colours, measured from TE's guide screen illustrations
 * (docs/research/55-screen.md §1–2). TE drew every page on a 480 × 220 pixel grid; the panel is
 * sold as 480 × 222, so the replica centres the 220-row design with one black row above and below.
 */

/** The design grid every page is drawn on. */
export const SCREEN = { width: 480, height: 220 } as const;

/** Rows of the physical 480 × 222 panel above the design grid (one black row each side). */
export const SCREEN_OFFSET_Y = 1;

/** Radius of the display's rounded corners (the guide art clips every page to it). */
export const SCREEN_CORNER_RADIUS = 8;

/** The eight-tone grey ramp (header cells, mix strips, step tiles); index 0 is the black cell. */
export const RAMP = [
	'#000000',
	'#2f2f37',
	'#484850',
	'#616169',
	'#7a7a82',
	'#96969b',
	'#afafb4',
	'#f7f5f5'
] as const;

/** Named screen colours. */
export const COLORS = {
	black: '#000000',
	/** TE's ink: text and pictograms on white cards. */
	ink: '#0f0e12',
	/** Warm white: text on black, cards. */
	white: '#f7f5f5',
	/** The near-black panel tone behind bands and grids. */
	panel: '#16161e',
	dark: '#2f2f37',
	grey1: '#484850',
	grey2: '#616169',
	grey3: '#7a7a82',
	grey4: '#96969b',
	/** Light grey: secondary text, handles, soft labels that are available. */
	light: '#afafb4',
	/** Soft labels that are not the main action. */
	dim: '#646464',
	/** The COM page's light card and radio highlights. */
	card: '#cdcdcd',
	/** The tempo page's grey panel. */
	tempo: '#7d7d7d',
	/** The pendulum, weight and hands on the tempo page. */
	chrome: '#c5c6cc',
	/** The active pattern box. */
	red: '#e5371b',
	/** Record dots and thresholds. */
	record: '#ff4d00',
	/**
	 * The pale grey of the player pictures (the arpeggio's bars, hold's ribbon, maestro's slabs, the
	 * hand while hold is off) and of the preset list's highlight, and their edges. The guide never
	 * shows it; the camera saw it pale blue (docs/research/59-screen-profiling.md §2.7), but the
	 * display has no blue, only greys (the owner, 2026-09-29), so these are the camera's brightness
	 * without its cast, tinted like TE's ramp.
	 */
	pale: '#c5c5cb',
	paleEdge: '#616169'
} as const;

/**
 * The colour of each encoder's dot on a page: dark, mid and light grey are filled, the white
 * encoder is a ring. Dots are 10 px, drawn 6 px in and 5 px down from a card's corner.
 */
export const ENCODER_DOTS = ['#0f0e12', '#484850', '#96969b', 'ring'] as const;

/** Centres of the four soft labels, above the M1–M4 keys (which sit under the screen). */
export const SOFT_KEY_X = [40, 175, 310, 440] as const;

/** Baseline of the soft labels (20 px text). */
export const SOFT_KEY_BASELINE = 215;

/** Text is drawn in these sizes on the device (px); 10 and 20 cover nearly everything. */
export const TEXT_SIZES = { label: 10, body: 20, title: 40, huge: 50 } as const;
