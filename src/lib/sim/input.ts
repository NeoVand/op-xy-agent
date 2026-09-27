/**
 * An input event for the simulator: the replica's press / release / turn / click / bend events fit
 * this shape (control ids as in `knowledge/opxy/controls.json`).
 */
export type SimInput =
	| { readonly type: 'press' | 'release'; readonly id: string }
	| { readonly type: 'turn'; readonly id: string; readonly delta: number; readonly fine?: boolean }
	| { readonly type: 'click'; readonly id: string }
	| { readonly type: 'bend'; readonly id: string; readonly value: number };
