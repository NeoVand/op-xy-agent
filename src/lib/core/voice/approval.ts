/**
 * Is what the user said a yes? Approvals come from the user, never from a model (the rule in
 * `agent/policy.ts`). When the voice model passes on a spoken "yes", the app also reads the
 * transcript of what the user actually said after the question, and only a clear yes counts.
 * Anything with a no in it, or neither, does not: the change waits, and the user can say it again
 * or tap approve. Deliberately strict; a missed yes costs a repeat, a false one a change.
 */

/** A spoken reply, classified. */
export type SpokenAnswer = 'yes' | 'no' | null;

// Word lists are matched on whole words of the lowercased, unpunctuated transcript. A few common
// languages besides English, since the voice answers in the user's language.
const NO =
	/(^| )(no|nope|nah|not|don ?t|do not|stop|cancel|wait|never|hold on|nein|non|nee|nej|nie|niet|нет|いいえ|不要|不)( |$)/;
const YES =
	/(^| )(yes|yeah|yep|yup|ya|sure|ok|okay|alright|all right|fine|correct|right|approve|approved|confirm|confirmed|go ahead|go for it|do it|please do|sounds good|absolutely|of course|affirmative|ja|jawohl|oui|si|sì|sí|sim|da|да|はい|是|好|对)( |$)/;

/** Lowercase words separated by single spaces, punctuation dropped (apostrophes too). */
function words(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFC')
		.replace(/['’`]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/**
 * `yes` for a clear yes ("yes", "sure, go ahead"), `no` when the reply holds any no ("no", "yes,
 * wait", "don't"), null when it holds neither.
 */
export function spokenAnswer(text: string): SpokenAnswer {
	const said = words(text);
	if (!said) return null;
	if (NO.test(said)) return 'no';
	return YES.test(said) ? 'yes' : null;
}
