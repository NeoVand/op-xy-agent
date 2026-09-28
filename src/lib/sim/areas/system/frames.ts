/**
 * Frames the system area draws (see `../types.ts`): plain data in the units the pages draw. The
 * project and COM pages themselves stay the core's `project` and `com` frames; these are the pages
 * behind them, the preset pages, the naming and confirm screens and the power states.
 */
import type { SoftLabel } from '../../screen/draw';

/**
 * Which of TE's list drawings a list page follows. The drawings place the columns a few pixels
 * apart from one another (and project-014 uses softer greys), so each page keeps its own art's
 * geometry (guide art project-019, com-014, instrument-103, project-014).
 */
export type ListLayout =
	'project-settings' | 'system-settings' | 'preset-settings' | 'folder' | 'history';

/** One column of a list page: the rows in view. */
export interface SystemListColumn {
	readonly items: readonly string[];
	/** The selected row (in view), or null. */
	readonly selected: number | null;
	/** Rows drawn dim (in view): a cut preset, a device that is not connected. */
	readonly dim?: readonly number[];
	/** The first row in view and how many rows there are, for the scroll bar. */
	readonly first: number;
	readonly total: number;
}

/** A list page: sections, settings and values, or folders and their contents. */
export interface SystemListFrame {
	readonly page: 'system-list';
	readonly layout: ListLayout;
	/** Left to right; the layout decides where each sits and how it shows its selection. */
	readonly columns: readonly SystemListColumn[];
	readonly soft: readonly (SoftLabel | null)[];
	/** What the page is (spoken). */
	readonly title: string;
}

/**
 * The preset browser as the device draws it on OS 1.1.33 (shift + M1, shift + Tn; camera
 * b1-1495…1568, research 59 §2.6): the track number over "preset", the engines or categories in
 * the middle with the chosen one boxed, its presets on the right with the highlighted one on a pale
 * bar, a scroll bar beside each list that overflows.
 */
export interface SystemPresetsFrame {
	readonly page: 'system-presets';
	/** The track, 1–8. */
	readonly track: number;
	/** By engine or by category. */
	readonly view: 'engine' | 'category';
	/** The middle column. */
	readonly groups: SystemListColumn;
	/** The right column (a cut preset's row drawn dim). */
	readonly presets: SystemListColumn;
	/** Cut, paste, rename and delete over M1–M4, shown while a user preset is highlighted. */
	readonly soft: readonly (SoftLabel | null)[];
	/** The view choice after a click of E1: the chosen view, and the popup's opacity (0–1). */
	readonly popup: { readonly view: 'engine' | 'category'; readonly alpha: number } | null;
}

/** The naming screen (rename, save as, preset and folder names). */
export interface SystemNamingFrame {
	readonly page: 'system-naming';
	/** What is being named ("rename project"). */
	readonly title: string;
	readonly text: string;
	readonly cursor: number;
	/** The character set around the cursor's character, which sits in the middle. */
	readonly strip: readonly string[];
	/** Why the last confirm was refused, shown in place of the title. */
	readonly notice: string | null;
	readonly soft: readonly (SoftLabel | null)[];
}

/** A question before something is deleted (ours). */
export interface SystemConfirmFrame {
	readonly page: 'system-confirm';
	readonly question: string;
	readonly name: string;
	readonly soft: readonly (SoftLabel | null)[];
}

/** Controller mode and MTP mode: the OP-XY wired to a computer (guide art com-022, com-039). */
export interface SystemLinkFrame {
	readonly page: 'system-link';
	readonly mode: 'controller' | 'mtp';
	/** Controller mode with shift held: channel, knob mode, octave keys (ours: no art). */
	readonly shift: readonly [string, string, string] | null;
	readonly soft: readonly (SoftLabel | null)[];
	/** A spoken note (MTP on a Mac needs TE's field kit app). */
	readonly hint: string | null;
}

/** COM devices: the known MIDI devices and the chosen one's switches (guide art com-030). */
export interface SystemDevicesFrame {
	readonly page: 'system-devices';
	readonly devices: SystemListColumn;
	/** Per row in view: connected, and whether it is a wireless (bluetooth) device. */
	readonly links: readonly { readonly connected: boolean; readonly wireless: boolean }[];
	/** "connected" / "not connected" for the chosen device, or null when the list is empty. */
	readonly status: string | null;
	readonly settings: SystemListColumn;
	readonly values: SystemListColumn;
}

/** A user tuning slot being edited (ours: no art). */
export interface SystemTuningFrame {
	readonly page: 'system-tuning';
	/** "user 1". */
	readonly slot: string;
	/** The note being tuned ("C#"). */
	readonly note: string;
	/** Cents and micro-cents as shown ("+12", "50"). */
	readonly cents: string;
	readonly micro: string;
	readonly soft: readonly (SoftLabel | null)[];
}

/** The screen while switched off, and our boot sequence (TE's boot art is not in the guide). */
export interface SystemPowerFrame {
	readonly page: 'system-power';
	readonly phase: 'off' | 'boot';
	/** How far the boot has come, 0–1. */
	readonly progress: number;
	/** The OS version the boot screen shows (manual: the logo and the OS version). */
	readonly version: string;
}

/** Every frame of the system area. */
export type SystemFrame =
	| SystemListFrame
	| SystemPresetsFrame
	| SystemNamingFrame
	| SystemConfirmFrame
	| SystemLinkFrame
	| SystemDevicesFrame
	| SystemTuningFrame
	| SystemPowerFrame;
