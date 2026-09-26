/**
 * The OP-XY's physical controls: typed lookups over `knowledge/opxy/controls.json`, the single
 * source of truth for the replica (geometry, colours, LEDs), the manual (names, legends) and the
 * device layer (remote keys, controller-mode emits). Ids follow the scheme in `ids.ts`.
 */
import type { Control, ControlGroup, ControlKind } from './controls.schema';
import { controlsFile } from './data';
import { UnknownControlError } from './errors';
import type { ControlId, KeyboardKeyId } from './ids';
import { closestMatch } from './suggest';

/** Every control, in the order of `controls.json` (panel reading order). */
export const CONTROLS: readonly Control[] = controlsFile.controls;

/** Panel-wide geometry: body, tile grid, keycap and LED-window dimensions, side profile. */
export const PANEL = controlsFile.panel;

/** Colour tokens (`token → { hex, role, … }`) referenced by each control's `colors`. */
export const COLOR_TOKENS = controlsFile.colors;

/** Source keys cited by `controls.json` entries. */
export const CONTROL_SOURCES = controlsFile.sources;

/** Base URL of TE's online guide; a control's `guide` field is `<slug>#<anchor>` below it. */
export const GUIDE_BASE_URL = 'https://teenage.engineering/guides/op-xy/';

const BY_ID = new Map<ControlId, Control>(CONTROLS.map((c) => [c.id, c]));

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Every accepted name (id, label, grammar token, alias), lower case → control. */
const BY_NAME = new Map<string, Control>();
for (const control of CONTROLS) {
	for (const name of [control.id, control.label, control.token, ...control.aliases]) {
		if (name !== null) BY_NAME.set(normalize(name), control);
	}
}

/** The 68 keys. */
export const KEYS: readonly Control[] = CONTROLS.filter((c) => c.kind === 'key');

/** The 48 keys with an LED window (tracks, steps, keyboard). */
export const LED_KEYS: readonly Control[] = KEYS.filter((c) => c.led !== null);

/**
 * The control with this id.
 * @throws {UnknownControlError} for a string that is not a control id (typed ids always resolve)
 */
export function getControl(id: ControlId): Control {
	const control = BY_ID.get(id);
	if (!control) throw new UnknownControlError(`unknown control id "${id}"`);
	return control;
}

/**
 * Finds a control by id, label, grammar token or alias, ignoring case and extra spaces
 * ("dark gray knob", "T3", "key.shift", "mixer"). A trailing "key" or "button" is optional.
 */
export function findControl(name: string): Control | undefined {
	const key = normalize(name);
	return BY_NAME.get(key) ?? BY_NAME.get(key.replace(/ (?:key|button)$/, ''));
}

/**
 * Like {@link findControl} but throws, suggesting the closest known name.
 * @throws {UnknownControlError}
 */
export function resolveControl(name: string): Control {
	const control = findControl(name);
	if (control) return control;
	const hint = closestMatch(normalize(name), BY_NAME.keys());
	throw new UnknownControlError(
		`unknown control "${name}"${hint ? ` — did you mean "${hint}"?` : ''}`
	);
}

/** Controls of one physical kind, in panel order. */
export function controlsOfKind(kind: ControlKind): Control[] {
	return CONTROLS.filter((c) => c.kind === kind);
}

/** Controls of one functional group, in panel order. */
export function controlsInGroup(group: ControlGroup): Control[] {
	return CONTROLS.filter((c) => c.group === group);
}

/** The keyboard key that plays `note` at the default octave (53–76), if any. */
export function keyboardKeyForNote(
	note: number
): (Control & { id: KeyboardKeyId; keyboard: NonNullable<Control['keyboard']> }) | undefined {
	return CONTROLS.find(
		(c): c is Control & { id: KeyboardKeyId; keyboard: NonNullable<Control['keyboard']> } =>
			c.keyboard?.note === note
	);
}

/**
 * Hex value of a colour token.
 * @throws {UnknownControlError} for an unknown token
 */
export function colorHex(token: string): string {
	const color = COLOR_TOKENS[token];
	if (!color) throw new UnknownControlError(`unknown colour token "${token}"`);
	return color.hex;
}

/** Full URL of the guide section that introduces a control, or null. */
export function guideUrl(control: Control): string | null {
	return control.guide === null ? null : GUIDE_BASE_URL + control.guide;
}

/** Centre of a key's LED window in panel millimetres, or null for keys without an LED. */
export function ledCenter(control: Control): { x: number; y: number } | null {
	if (control.kind !== 'key' || control.led === null) return null;
	const { offset } = PANEL.ledWindow;
	return { x: control.geometry.center.x + offset.x, y: control.geometry.center.y + offset.y };
}

/**
 * The visible tile of a grid control: its pitch cell inset by half the gap between tiles.
 * Hit testing should use `geometry.rect` (the full cell) instead.
 */
export function visibleTileRect(control: Control): { x: number; y: number; w: number; h: number } {
	const { rect } = control.geometry;
	if (!control.geometry.grid) return rect;
	const inset = (PANEL.grid.pitch - PANEL.grid.tileSize) / 2;
	return { x: rect.x + inset, y: rect.y + inset, w: rect.w - 2 * inset, h: rect.h - 2 * inset };
}
