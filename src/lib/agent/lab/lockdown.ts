/**
 * The lab worker's walls, put up once the lab has loaded and before any program runs. A program is
 * model-written code in the worker's own realm, beside the lab:
 *
 * - **No way out.** Every global but JavaScript's own and a few harmless helpers is removed. That
 *   takes the network (fetch, XMLHttpRequest, WebSocket, WebTransport, EventSource, importScripts),
 *   storage (indexedDB, caches, the storage manager and its private files), devices (navigator
 *   with its USB, HID, serial, Bluetooth and GPU), messaging (postMessage, BroadcastChannel,
 *   MessageChannel), new workers (which would start without these walls), and whatever a browser
 *   adds later, since the list names what stays.
 * - **No new code.** eval, the Function constructors (plain, async, generator), strings as timers
 *   and WebAssembly are gone once the program is compiled; `import()` is syntax, so `run.ts`
 *   refuses it before compiling.
 * - **Frozen built-ins**, so a program cannot change how the lab's own code behaves (a patched
 *   JSON.stringify could forge what the worker hands back). Properties that code commonly sets on
 *   its own objects (an error's name, an object's toString) become accessors that define the
 *   property on the object, so freezing their prototype does not break that assignment.
 */

/** JavaScript's own globals: they stay (frozen). */
const LANGUAGE = [
	'Object',
	'Function',
	'Array',
	'Number',
	'parseFloat',
	'parseInt',
	'Infinity',
	'NaN',
	'undefined',
	'Boolean',
	'String',
	'Symbol',
	'Date',
	'Promise',
	'RegExp',
	'Error',
	'AggregateError',
	'EvalError',
	'RangeError',
	'ReferenceError',
	'SyntaxError',
	'TypeError',
	'URIError',
	'SuppressedError',
	'JSON',
	'Math',
	'Intl',
	'ArrayBuffer',
	'SharedArrayBuffer',
	'Atomics',
	'Uint8Array',
	'Int8Array',
	'Uint16Array',
	'Int16Array',
	'Uint32Array',
	'Int32Array',
	'Float16Array',
	'Float32Array',
	'Float64Array',
	'Uint8ClampedArray',
	'BigUint64Array',
	'BigInt64Array',
	'DataView',
	'Map',
	'BigInt',
	'Set',
	'WeakMap',
	'WeakSet',
	'WeakRef',
	'FinalizationRegistry',
	'Proxy',
	'Reflect',
	'decodeURI',
	'decodeURIComponent',
	'encodeURI',
	'encodeURIComponent',
	'escape',
	'unescape',
	'isFinite',
	'isNaN',
	'Iterator',
	'DisposableStack',
	'AsyncDisposableStack'
] as const;

/** Host globals that stay: they reach nothing outside the worker. */
const HARMLESS = [
	'self',
	'globalThis',
	'console',
	'setTimeout',
	'clearTimeout',
	'setInterval',
	'clearInterval',
	'queueMicrotask',
	'structuredClone',
	'performance',
	'crypto',
	'TextEncoder',
	'TextDecoder',
	'atob',
	'btoa',
	'DOMException',
	'AbortController',
	'AbortSignal'
] as const;

const KEEP: ReadonlySet<string> = new Set<string>([...LANGUAGE, ...HARMLESS, 'eval']);

/** Timers that stay, wrapped so they take functions only (a string would be new code). */
const TIMERS = ['setTimeout', 'setInterval'] as const;

/** Built-in prototype properties code sets on its own objects (see the header). */
const OVERRIDABLE: readonly [() => object, readonly string[]][] = [
	[() => Object.prototype, ['constructor', 'toString', 'toLocaleString', 'valueOf']],
	[() => Function.prototype, ['constructor', 'name', 'toString']],
	[() => Array.prototype, ['toString']],
	[() => Promise.prototype, ['constructor']],
	...(
		[
			'Error',
			'AggregateError',
			'EvalError',
			'RangeError',
			'ReferenceError',
			'SyntaxError',
			'TypeError',
			'URIError'
		] as const
	).map(
		(name) =>
			[
				() => (globalThis as unknown as Record<string, { prototype: object }>)[name].prototype,
				['constructor', 'message', 'name', 'toString']
			] as [() => object, readonly string[]]
	)
];

/** What lockdown did, for tests. */
export interface LockdownReport {
	/** Globals removed. */
	readonly removed: readonly string[];
	/** Globals that could not be removed (none, on the browsers we know). */
	readonly stuck: readonly string[];
}

type Callable = (...args: unknown[]) => unknown;

/** A function that refuses, in place of one that would generate code. */
function refusing(what: string): Callable {
	return function refused() {
		throw new EvalError(
			`${what} is not available in the lab: it runs only the program it was given`
		);
	};
}

/** Turns a data property into an accessor whose setter defines the property on the object set. */
function overridable(proto: object, key: string): void {
	const found = Object.getOwnPropertyDescriptor(proto, key);
	if (!found || !('value' in found) || !found.configurable) return;
	const value: unknown = found.value;
	Object.defineProperty(proto, key, {
		configurable: false,
		enumerable: found.enumerable,
		get() {
			return value;
		},
		set(this: object, next: unknown) {
			if (this === proto) throw new TypeError(`Cannot assign to read only property '${key}'`);
			Object.defineProperty(this, key, {
				value: next,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
	});
}

/** Freezes `root` and everything reachable from it (properties, accessors, prototypes). */
function harden(root: unknown, seen: Set<unknown>): void {
	const stack = [root];
	while (stack.length > 0) {
		const value = stack.pop();
		if ((typeof value !== 'object' && typeof value !== 'function') || value === null) continue;
		if (seen.has(value) || value === globalThis) continue;
		seen.add(value);
		Object.freeze(value);
		stack.push(Object.getPrototypeOf(value));
		for (const key of Reflect.ownKeys(value)) {
			const d = Object.getOwnPropertyDescriptor(value, key);
			if (!d) continue;
			if ('value' in d) stack.push(d.value);
			else stack.push(d.get, d.set);
		}
	}
}

/** Prototypes of the language no global names (the iterators', the generators', async functions'). */
function hiddenIntrinsics(): unknown[] {
	const generator = function* () {};
	const asyncGenerator = async function* () {};
	return [
		Object.getPrototypeOf(async function () {}),
		Object.getPrototypeOf(generator),
		Object.getPrototypeOf(generator()),
		Object.getPrototypeOf(asyncGenerator),
		Object.getPrototypeOf(asyncGenerator()),
		Object.getPrototypeOf([][Symbol.iterator]()),
		Object.getPrototypeOf(new Map().entries()),
		Object.getPrototypeOf(new Set().values()),
		Object.getPrototypeOf(''[Symbol.iterator]()),
		Object.getPrototypeOf(/x/[Symbol.matchAll]('')),
		Object.getPrototypeOf(Uint8Array)
	];
}

/**
 * Locks the worker down (see the header). Call once, after every module the lab needs has loaded
 * and after the lab has taken what it keeps (postMessage, the message listener, the Function
 * constructor its runner compiles with).
 */
export function lockDown(scope: typeof globalThis = globalThis): LockdownReport {
	const global = scope as unknown as Record<string | symbol, unknown>;

	// no new code: the constructors every function reaches, then eval and string timers
	const FunctionStandIn = refusing('new Function');
	FunctionStandIn.prototype = Function.prototype;
	Object.defineProperty(Function.prototype, 'constructor', { value: FunctionStandIn });
	const generator = function* () {};
	const asyncGenerator = async function* () {};
	for (const [fn, what] of [
		[async function () {}, 'an async Function constructor'],
		[generator, 'a generator Function constructor'],
		[asyncGenerator, 'an async generator Function constructor']
	] as const) {
		Object.defineProperty(Object.getPrototypeOf(fn), 'constructor', { value: refusing(what) });
	}
	const own = (key: string, value: unknown) =>
		Object.defineProperty(scope, key, { value, writable: true, configurable: true });
	own('Function', FunctionStandIn);
	own('eval', refusing('eval'));
	for (const name of TIMERS) {
		const timer = scope[name] as unknown as (handler: unknown, ...rest: unknown[]) => unknown;
		own(name, (handler: unknown, ...rest: unknown[]) => {
			if (typeof handler !== 'function') throw new EvalError(`${name} takes a function in the lab`);
			return timer.call(scope, handler, ...rest);
		});
	}

	// no way out: everything not kept goes, from the global and the prototypes it inherits from
	// (browsers keep most of a worker's API there), up to EventTarget's
	const stop = typeof EventTarget === 'undefined' ? Object.prototype : EventTarget.prototype;
	const chain: object[] = [];
	for (let at: object | null = scope; at && at !== stop && at !== Object.prototype;) {
		chain.push(at);
		at = Object.getPrototypeOf(at) as object | null;
	}
	const gone = new Set<string | symbol>();
	for (const holder of chain) {
		const inherited = holder !== scope;
		for (const key of Reflect.ownKeys(holder)) {
			if (key === Symbol.toStringTag || (inherited && key === 'constructor')) continue;
			const kept = typeof key === 'string' && KEEP.has(key);
			// the wrapped timers stay on the global; the originals go from its prototypes
			if (kept && !(inherited && (TIMERS as readonly string[]).includes(key))) continue;
			if (!kept) gone.add(key);
			Reflect.deleteProperty(holder, key);
		}
	}
	const removed: string[] = [];
	const stuck: string[] = [];
	for (const key of gone) {
		if (!Reflect.has(scope, key)) {
			removed.push(String(key));
			continue;
		}
		// could not be deleted somewhere along the chain: shadow it on the global
		try {
			Object.defineProperty(scope, key, { value: undefined, writable: false, configurable: false });
			removed.push(String(key));
		} catch {
			stuck.push(String(key));
		}
	}

	// frozen built-ins, with the common overrides still working
	for (const [proto, keys] of OVERRIDABLE) for (const key of keys) overridable(proto(), key);
	const seen = new Set<unknown>();
	for (const name of LANGUAGE) harden(global[name], seen);
	for (const intrinsic of hiddenIntrinsics()) harden(intrinsic, seen);
	return { removed, stuck };
}
