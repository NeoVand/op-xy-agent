/**
 * Which microphone to use. The OP-XY is a USB audio input too (docs/research/90-device-probe.md),
 * so a browser's default input can be the synth itself: voice would then hear the OP-XY's output
 * instead of the user. The picker skips it.
 */

/** What `enumerateDevices()` reports, as far as picking needs. */
export interface AudioInputInfo {
	readonly deviceId: string;
	readonly kind: string;
	readonly label: string;
}

/** Whether an input's label names the OP-XY (labels are empty before mic permission). */
export function isOpxyInput(label: string): boolean {
	return /\bop[-\s]?xy\b|teenage/i.test(label);
}

/**
 * The device id to open: the preferred input if it is still there, else the browser's default,
 * else the first other input, never the OP-XY. Null when no usable input is listed.
 */
export function pickMicrophone(
	devices: readonly AudioInputInfo[],
	options: { readonly preferred?: string | null } = {}
): string | null {
	const usable = devices.filter(
		(d) => d.kind === 'audioinput' && d.deviceId && !isOpxyInput(d.label)
	);
	if (options.preferred && usable.some((d) => d.deviceId === options.preferred)) {
		return options.preferred;
	}
	const fallback =
		usable.find((d) => d.deviceId === 'default') ??
		usable.find((d) => d.deviceId !== 'communications');
	return fallback?.deviceId ?? null;
}
