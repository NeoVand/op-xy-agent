// The single-flight device queue: one job at a time, in submission order; abortAll stops the
// running job and rejects the waiting ones without running them.
import { describe, expect, it } from 'vitest';
import { DeviceQueue, QueueAbortedError } from './queue';

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('DeviceQueue', () => {
	it('runs jobs one at a time in submission order', async () => {
		const queue = new DeviceQueue();
		const log: string[] = [];
		const gate = deferred();
		const a = queue.run('a', async () => {
			log.push('a start');
			await gate.promise;
			log.push('a end');
			return 1;
		});
		const b = queue.run('b', async () => {
			log.push('b');
			return 2;
		});
		await Promise.resolve();
		expect(queue.busy).toBe(true);
		expect(queue.current).toBe('a');
		expect(queue.pending).toBe(1);
		expect(log).toEqual(['a start']);
		gate.resolve();
		expect(await a).toBe(1);
		expect(await b).toBe(2);
		expect(log).toEqual(['a start', 'a end', 'b']);
		expect(queue.busy).toBe(false);
	});

	it('keeps going after a job fails', async () => {
		const queue = new DeviceQueue();
		const failing = queue.run('bad', async () => {
			throw new Error('boom');
		});
		const next = queue.run('good', async () => 'ok');
		await expect(failing).rejects.toThrow('boom');
		expect(await next).toBe('ok');
	});

	it('abortAll aborts the running job and rejects waiting ones without running them', async () => {
		const queue = new DeviceQueue();
		let secondRan = false;
		const running = queue.run(
			'long',
			(signal) =>
				new Promise<string>((_, reject) => {
					signal.addEventListener('abort', () => reject(new QueueAbortedError('aborted')));
				})
		);
		const waiting = queue.run('later', async () => {
			secondRan = true;
		});
		await Promise.resolve();
		queue.abortAll('panic');
		await expect(running).rejects.toBeInstanceOf(QueueAbortedError);
		await expect(waiting).rejects.toThrow(/panic before it ran/);
		expect(secondRan).toBe(false);
		expect(await queue.run('after', async () => 'fresh')).toBe('fresh');
	});

	it('honours the caller signal for queued and running jobs', async () => {
		const queue = new DeviceQueue();
		const gate = deferred();
		const first = queue.run('first', async () => gate.promise);
		const controller = new AbortController();
		const queued = queue.run('queued', async () => 'never', controller.signal);
		controller.abort();
		await expect(queued).rejects.toBeInstanceOf(QueueAbortedError);
		gate.resolve();
		await first;
		const aborted = new AbortController();
		aborted.abort();
		await expect(queue.run('late', async () => 'x', aborted.signal)).rejects.toThrow(
			/stopped before it ran/
		);
	});

	it('reports changes for the UI', async () => {
		const queue = new DeviceQueue();
		let changes = 0;
		queue.onChange(() => changes++);
		await queue.run('one', async () => undefined);
		expect(changes).toBeGreaterThanOrEqual(2);
	});
});
