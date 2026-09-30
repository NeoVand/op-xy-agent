/**
 * The owner's API keys for the evals: $ANTHROPIC_API_KEY / $OPENAI_API_KEY or .env, each chosen by
 * its prefix (the .env names were once swapped). Never printed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every value in .env (the names are not trusted, the prefixes are). */
function envValues(): string[] {
	let text = '';
	try {
		text = readFileSync(join(process.cwd(), '.env'), 'utf8');
	} catch {
		// no .env
	}
	return text.split('\n').map((line) =>
		line
			.slice(line.indexOf('=') + 1)
			.trim()
			.replace(/^['"]|['"]$/g, '')
	);
}

/** The Anthropic key: $ANTHROPIC_API_KEY or .env, chosen by its prefix. Never printed. */
export function anthropicKey(): string {
	const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
	if (fromEnv?.startsWith('sk-ant-')) return fromEnv;
	const value = envValues().find((v) => v.startsWith('sk-ant-'));
	if (value) return value;
	throw new Error('No Anthropic key (sk-ant-…) in $ANTHROPIC_API_KEY or .env');
}

/**
 * The OpenAI key (for a simulated user from another model family): $OPENAI_API_KEY or .env, the
 * value that starts with sk- but is not an Anthropic key. Never printed.
 */
export function openaiKey(): string {
	const isOpenai = (v: string | undefined) =>
		!!v && v.startsWith('sk-') && !v.startsWith('sk-ant-');
	const fromEnv = process.env.OPENAI_API_KEY?.trim();
	if (isOpenai(fromEnv)) return fromEnv!;
	const value = envValues().find(isOpenai);
	if (value) return value;
	throw new Error('No OpenAI key (sk-…, not sk-ant-…) in $OPENAI_API_KEY or .env');
}
