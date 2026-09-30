/**
 * Quick replies: two or three short things to say next, offered under the last answer (the chat
 * sends one with a click). They come from the turn itself, never from another model call: the
 * answer's closing question when it offers something ("Want me to add a fill?" → "yes, do it"; its
 * alternatives when it offers a choice: "add a fill", "make it a song"), then next steps from what
 * the turn did on the replica (a pattern written: "make it busier"; a sound moved: "a bit more"; any
 * change: "teach me to do that", so what the agent did becomes something the user can do; a combo
 * shown: "walk me through it"). None after an error, none while nothing happened worth following up.
 */
import type { ChatEntry } from './chat';

/** The most replies offered. */
export const MAX_REPLIES = 3;

/** An offer's lead ("Want me to", "Shall I"), which a yes answers. */
const OFFER =
	/^(?:do you want me to|would you like me to|want me to|shall i|should i|shall we|want to|should we)\s+(.+)\?$/i;
/** Words an alternative may not exceed to make a chip. */
const MAX_WORDS = 6;

const plain = (text: string) =>
	text
		.replace(/\[[^\]]*\]/g, '')
		.replace(/[*_`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/** The answer's last sentence, when it is a question. */
function closingQuestion(answer: string): string | null {
	const lines = answer.split('\n').map(plain).filter(Boolean);
	const last = lines.at(-1);
	if (!last?.endsWith('?')) return null;
	const sentences = last.split(/(?<=[.!?])\s+/);
	return sentences.at(-1) ?? null;
}

/** A question that asks rather than offers ("Is it…", "What…"), so its words are no answer. */
const ASKING =
	/^(?:is|are|was|do|does|did|can|could|would|will|should|shall|what|which|who|how|why|where|when)\b/i;

/**
 * "add a fill, or make it a song" → ["add a fill", "make it a song"]: 2–3 alternatives of at most
 * `words` words each, lowercase, else null.
 */
function alternatives(body: string, words = MAX_WORDS): string[] | null {
	const parts = body
		.replace(/\?$/, '')
		.split(/,?\s+or\s+|,\s+/i)
		.map((part) => part.trim().replace(/^(?:to|maybe)\s+/i, ''))
		.filter(Boolean);
	if (parts.length < 2 || parts.length > 3) return null;
	if (parts.some((part) => part.split(' ').length > words)) return null;
	return parts.map((part) => part.charAt(0).toLowerCase() + part.slice(1));
}

/**
 * What the closing question offers to answer with: an offer's yes, or its alternatives ("Shall I
 * add a fill, or make it a song?"); the choices a question lists ("What vibe: dark, bouncy or
 * dreamy?", "Darker or brighter?"); else nothing.
 */
export function questionReplies(answer: string): string[] {
	const question = closingQuestion(answer);
	if (!question) return [];
	const offer = OFFER.exec(question);
	if (offer) return alternatives(offer[1]) ?? ['yes, do it'];
	const colon = question.indexOf(': ');
	if (colon > 0) return alternatives(question.slice(colon + 2)) ?? [];
	if (ASKING.test(question)) return [];
	return alternatives(question, 4) ?? [];
}

/** What the turn since the user's last message did: its answer, its tools, its changes. */
function lastTurn(entries: readonly ChatEntry[]) {
	const start = entries.findLastIndex((entry) => entry.kind === 'user');
	const turn = start < 0 ? [] : entries.slice(start + 1);
	const top = turn.filter((entry) => !('parent' in entry) || entry.parent === null);
	const answer = top
		.flatMap((entry) => (entry.kind === 'text' ? [entry.text] : []))
		.join('\n')
		.trim();
	const tools = top.flatMap((entry) => (entry.kind === 'tool' ? [entry.name] : []));
	const changes = turn.flatMap((entry) =>
		entry.kind === 'changes' && entry.undo !== 'undone' ? entry.lines : []
	);
	const failed = turn.some((entry) => entry.kind === 'notice' && entry.tone === 'error');
	return { answer, tools, changes, failed };
}

/** Next steps from what the turn did: what it changed on the replica, what it showed there. */
function nextSteps(changes: readonly string[], tools: readonly string[]): string[] {
	const steps: string[] = [];
	const any = (pattern: RegExp) => changes.some((line) => pattern.test(line));
	if (any(/^T\d pattern|^T\d: patterns/)) {
		steps.push('make it busier');
		if (!any(/^(?:scenes|song):/)) steps.push('turn it into a song');
	}
	if (any(/^(?:scenes|song):/)) steps.push('play the song');
	// a sound or the tempo moved one way: more of the same
	if (any(/^T\d (?:M[1-4]|shift M[23]) |^tempo |^groove /)) steps.push('a bit more');
	const walked = tools.includes('plan_steps');
	if (changes.length > 0 && !walked) steps.push('teach me to do that');
	else if (changes.length === 0 && tools.includes('show_on_replica') && !walked) {
		steps.push('walk me through it');
	}
	return steps;
}

/** What to offer under the last answer: up to {@link MAX_REPLIES}, most fitting first. */
export function quickReplies(entries: readonly ChatEntry[]): string[] {
	const { answer, tools, changes, failed } = lastTurn(entries);
	if (failed || !answer) return [];
	const replies = [...questionReplies(answer), ...nextSteps(changes, tools)];
	return replies.filter((reply, i) => replies.indexOf(reply) === i).slice(0, MAX_REPLIES);
}
