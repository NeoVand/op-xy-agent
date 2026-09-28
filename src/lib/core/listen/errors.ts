/** Input the listening analysis cannot take (no channels, mismatched lengths, a bad sample rate). */
export class ListenError extends Error {
	override name = 'ListenError';
}
