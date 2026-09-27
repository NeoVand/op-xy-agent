/**
 * Compact SVG path data (the absolute `M L H V C Z` subset the extraction script writes) compiled
 * once into a flat op list and replayed onto a {@link ScreenCtx} with a translate + uniform scale.
 */
import type { ScreenCtx } from './context';

const MOVE = 0;
const LINE = 1;
const CUBIC = 2;
const CLOSE = 3;

/** A compiled path: opcodes followed by their coordinates. */
export type PathOps = readonly number[];

/** Invalid path data. */
export class PathDataError extends Error {
	name = 'PathDataError';
}

const TOKEN = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/**
 * Compiles path data. Only absolute commands are accepted (the extraction script never writes
 * relative ones); anything else throws, so a malformed knowledge file fails loudly in tests.
 * @throws {PathDataError}
 */
export function compilePath(d: string): PathOps {
	const tokens = d.match(TOKEN) ?? [];
	const ops: number[] = [];
	let i = 0;
	let cmd = '';
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	const num = (): number => {
		const t = tokens[i++];
		if (t === undefined || /[A-Za-z]/.test(t))
			throw new PathDataError(`path data ends early: ${d}`);
		return Number(t);
	};
	while (i < tokens.length) {
		if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
		switch (cmd) {
			case 'M':
				x = num();
				y = num();
				startX = x;
				startY = y;
				ops.push(MOVE, x, y);
				cmd = 'L';
				break;
			case 'L':
				x = num();
				y = num();
				ops.push(LINE, x, y);
				break;
			case 'H':
				x = num();
				ops.push(LINE, x, y);
				break;
			case 'V':
				y = num();
				ops.push(LINE, x, y);
				break;
			case 'C': {
				const c = [num(), num(), num(), num(), num(), num()];
				x = c[4];
				y = c[5];
				ops.push(CUBIC, ...c);
				break;
			}
			case 'Z':
				ops.push(CLOSE);
				x = startX;
				y = startY;
				// a number after Z would be a stray: the next token must be a command
				if (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
					throw new PathDataError(`stray number after Z in ${d}`);
				}
				break;
			default:
				throw new PathDataError(`unsupported path command "${cmd}" in ${d}`);
		}
	}
	return ops;
}

const cache = new Map<string, PathOps>();

/** {@link compilePath} with a cache keyed by the path data. */
export function compiled(d: string): PathOps {
	let ops = cache.get(d);
	if (!ops) {
		ops = compilePath(d);
		cache.set(d, ops);
	}
	return ops;
}

/** Adds a compiled path to the context's current path, mapped by `x' = ox + x·k`. */
export function tracePath(ctx: ScreenCtx, ops: PathOps, ox = 0, oy = 0, k = 1): void {
	for (let i = 0; i < ops.length;) {
		switch (ops[i]) {
			case MOVE:
				ctx.moveTo(ox + ops[i + 1] * k, oy + ops[i + 2] * k);
				i += 3;
				break;
			case LINE:
				ctx.lineTo(ox + ops[i + 1] * k, oy + ops[i + 2] * k);
				i += 3;
				break;
			case CUBIC:
				ctx.bezierCurveTo(
					ox + ops[i + 1] * k,
					oy + ops[i + 2] * k,
					ox + ops[i + 3] * k,
					oy + ops[i + 4] * k,
					ox + ops[i + 5] * k,
					oy + ops[i + 6] * k
				);
				i += 7;
				break;
			default:
				ctx.closePath();
				i += 1;
		}
	}
}
