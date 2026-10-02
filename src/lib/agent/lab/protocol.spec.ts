// The worker's messages as the browser host reads them: a take's read-back crosses intact (the
// schema once stripped it, so no agent saw what its takes held).
import { describe, expect, it } from 'vitest';
import { readFromWorker } from './protocol';

describe('readFromWorker', () => {
	it('keeps what a take holds, read back', () => {
		const message = readFromWorker({
			type: 'done',
			id: 'run-1',
			result: {
				ok: true,
				logs: '',
				commits: [],
				takes: [
					{
						label: 'accents',
						changes: ['T1 pattern 1: 15 → 22 notes'],
						reads: ['T1 p1 closed hat 1: 9.3. 9.3. 9.3. 9.3.'],
						base: '{}',
						project: '{}'
					}
				],
				project: null,
				forks: 1,
				listens: 0,
				ms: 3
			}
		});
		expect(message?.type).toBe('done');
		const takes = message?.type === 'done' ? message.result.takes : undefined;
		expect(takes?.[0].reads).toEqual(['T1 p1 closed hat 1: 9.3. 9.3. 9.3. 9.3.']);
	});
});
