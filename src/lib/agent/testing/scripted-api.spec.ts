// The scripted API rejects requests the real API rejects, so conductor tests catch them.
import { describe, expect, it } from 'vitest';
import { requestProblem } from './scripted-api';

const searchResult = {
	type: 'search_result',
	source: 'https://x.test',
	title: 'T',
	content: [{ type: 'text', text: 'x' }]
};

describe('requestProblem', () => {
	it('rejects a tool result that mixes search results with other blocks', () => {
		const body = {
			messages: [
				{ role: 'user', content: 'hi' },
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: 't',
							content: [{ type: 'text', text: 'ids' }, searchResult]
						}
					]
				}
			]
		};
		expect(requestProblem(body)).toMatch(/^messages\.1\.content\.0\.tool_result: if any blocks/);
	});

	it('accepts search results alone, text alone and plain string results', () => {
		const body = {
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', tool_use_id: 'a', content: [searchResult, searchResult] },
						{ type: 'tool_result', tool_use_id: 'b', content: [{ type: 'text', text: 'ok' }] },
						{ type: 'tool_result', tool_use_id: 'c', content: 'ok' }
					]
				}
			]
		};
		expect(requestProblem(body)).toBeNull();
		expect(requestProblem(null)).toBeNull();
	});
});
