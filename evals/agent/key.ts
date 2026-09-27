/**
 * The owner's Anthropic key for the evals: $ANTHROPIC_API_KEY or .env, whichever value starts with
 * sk-ant- (the .env names were once swapped). Never printed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The Anthropic key: $ANTHROPIC_API_KEY or .env, chosen by its prefix. Never printed. */
export function anthropicKey(): string {
	const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
	if (fromEnv?.startsWith('sk-ant-')) return fromEnv;
	let text = '';
	try {
		text = readFileSync(join(process.cwd(), '.env'), 'utf8');
	} catch {
		// no .env
	}
	for (const line of text.split('\n')) {
		const value = line
			.slice(line.indexOf('=') + 1)
			.trim()
			.replace(/^['"]|['"]$/g, '');
		if (value.startsWith('sk-ant-')) return value;
	}
	throw new Error('No Anthropic key (sk-ant-…) in $ANTHROPIC_API_KEY or .env');
}
