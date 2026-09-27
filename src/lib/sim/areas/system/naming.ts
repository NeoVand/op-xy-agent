/**
 * The naming screen (manual: project/project-view "rename", instrument/preset-management "rename"):
 * E1 picks the character, the other encoders change it; M1 confirms, M2 moves on to the next
 * character, M3 cancels and M4 deletes. The character set, the length limit and what M2 does at
 * the end of the name (it adds a character) are ours.
 */
import { clamp } from '../../params';
import { NAME_CHARACTERS, NAME_MAX } from './catalogue';
import type { NamingPurpose, NamingState, SystemPage } from './state';

/** Opens the naming screen on `text`, with the cursor on its last character. */
export function startNaming(
	purpose: NamingPurpose,
	text: string,
	original: string,
	back: SystemPage | null
): NamingState {
	const clean = [...text.toLowerCase()]
		.map((c) => (NAME_CHARACTERS.includes(c) ? c : '-'))
		.join('')
		.slice(0, NAME_MAX);
	return {
		purpose,
		text: clean,
		cursor: Math.max(0, clean.length - 1),
		original,
		back,
		notice: null
	};
}

/** E1: moves the cursor along the name. */
export function moveCursor(n: NamingState, delta: number): void {
	n.cursor = clamp(n.cursor + delta, 0, Math.max(0, n.text.length - 1));
	n.notice = null;
}

/** E2–E4: turns the character under the cursor through the set (wrapping around). */
export function changeCharacter(n: NamingState, delta: number): void {
	const chars = [...n.text];
	if (chars.length === 0) chars.push(NAME_CHARACTERS[0]);
	const at = Math.max(0, NAME_CHARACTERS.indexOf(chars[n.cursor] ?? NAME_CHARACTERS[0]));
	const size = NAME_CHARACTERS.length;
	chars[n.cursor] = NAME_CHARACTERS[(((at + delta) % size) + size) % size];
	n.text = chars.join('');
	n.notice = null;
}

/** M2: the next character; past the end it adds one (a copy of the last, ours). */
export function nextCharacter(n: NamingState): void {
	if (n.cursor < n.text.length - 1) n.cursor += 1;
	else if (n.text.length < NAME_MAX) {
		n.text += n.text.length ? n.text[n.text.length - 1] : NAME_CHARACTERS[0];
		n.cursor = n.text.length - 1;
	}
	n.notice = null;
}

/** M4: deletes the character under the cursor. */
export function deleteCharacter(n: NamingState): void {
	if (n.text.length === 0) return;
	n.text = n.text.slice(0, n.cursor) + n.text.slice(n.cursor + 1);
	n.cursor = clamp(n.cursor, 0, Math.max(0, n.text.length - 1));
	n.notice = null;
}

/** The name as it will be stored (trimmed), or null when it is empty. */
export function finalName(n: NamingState): string | null {
	const name = n.text.trim().replace(/ {2,}/g, ' ');
	return name.length > 0 ? name : null;
}

/** The characters either side of `c` in the set (the screen shows them around the cursor). */
export function neighbours(c: string, reach: number): string[] {
	const size = NAME_CHARACTERS.length;
	const at = Math.max(0, NAME_CHARACTERS.indexOf(c));
	return Array.from(
		{ length: reach * 2 + 1 },
		(_, i) => NAME_CHARACTERS[(((at - reach + i) % size) + size) % size]
	);
}
