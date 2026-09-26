/**
 * Tooltip attachment: `<button {@attach tooltip('clear pattern')}>`.
 *
 * The tip is a tiny black "screen" (black glass, warm-white type) in both themes, placed above the
 * element (below when there is no room). It appears on mouse hover after a short delay and at once
 * on keyboard focus, and hides on leave, blur, press or Escape. Styles are inline so the element
 * works when appended to <body>, outside any component's scoped CSS.
 */
import type { Attachment } from 'svelte/attachments';

/** Tooltip behaviour. */
export interface TooltipOptions {
	/** Preferred side; flips when the viewport has no room. Default `top`. */
	placement?: 'top' | 'bottom';
	/** Hover delay in ms before showing. Default 450. Keyboard focus shows immediately. */
	delay?: number;
	/**
	 * Link the tip with `aria-describedby`. Turn off when the text duplicates the element's
	 * accessible name (icon buttons), so screen readers don't read it twice. Default true.
	 */
	describe?: boolean;
}

const GAP = 8;
const MARGIN = 8;
let nextId = 0;

const BASE_STYLE = [
	'position:fixed',
	'left:0',
	'top:0',
	'z-index:var(--xy-z-tooltip)',
	'pointer-events:none',
	'max-width:18rem',
	'padding:0.3125rem 0.5625rem',
	'border-radius:var(--xy-radius-card)',
	'background:var(--xy-scr-bg)',
	'color:var(--xy-scr-fg)',
	'font-family:var(--xy-font-sans)',
	'font-size:var(--xy-text-xs)',
	'line-height:var(--xy-leading-xs)',
	'font-weight:450',
	'letter-spacing:var(--xy-tracking-label)',
	'white-space:normal',
	'text-wrap:balance',
	'box-shadow:0 0 0 1px rgb(255 255 255 / 0.08), 0 8px 24px -6px rgb(0 0 0 / 0.6)',
	'opacity:0',
	'transition:opacity var(--xy-dur-quick) var(--xy-ease-standard)'
].join(';');

/**
 * Create a tooltip attachment. Passing an empty value attaches nothing, so it can be conditional.
 * @param content Tooltip text (plain text, lowercase in the device voice).
 * @param options Placement, delay and ARIA behaviour.
 */
export function tooltip(
	content: string | null | undefined,
	options: TooltipOptions = {}
): Attachment<HTMLElement> {
	return (node) => {
		if (!content) return;
		const text = content;
		const { placement = 'top', delay = 450, describe = true } = options;
		const id = `xy-tip-${++nextId}`;
		let tip: HTMLDivElement | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;

		function position(el: HTMLDivElement) {
			const r = node.getBoundingClientRect();
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			const roomAbove = r.top - GAP - h >= MARGIN;
			const roomBelow = r.bottom + GAP + h <= window.innerHeight - MARGIN;
			const above = placement === 'top' ? roomAbove || !roomBelow : !roomBelow && roomAbove;
			const x = Math.min(
				Math.max(r.left + r.width / 2 - w / 2, MARGIN),
				window.innerWidth - w - MARGIN
			);
			const y = above ? r.top - GAP - h : r.bottom + GAP;
			el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
		}

		function show() {
			clearTimeout(timer);
			if (tip) return;
			tip = document.createElement('div');
			tip.id = id;
			tip.setAttribute('role', 'tooltip');
			tip.style.cssText = BASE_STYLE;
			tip.textContent = text;
			document.body.appendChild(tip);
			// position() reads layout, so the start state is committed and this change transitions.
			position(tip);
			tip.style.opacity = '1';
			if (describe) node.setAttribute('aria-describedby', id);
		}

		function hide() {
			clearTimeout(timer);
			if (!tip) return;
			if (describe && node.getAttribute('aria-describedby') === id) {
				node.removeAttribute('aria-describedby');
			}
			tip.remove();
			tip = null;
		}

		function onPointerEnter(event: PointerEvent) {
			if (event.pointerType !== 'mouse') return;
			clearTimeout(timer);
			timer = setTimeout(show, delay);
		}

		function onFocusIn() {
			// Only keyboard focus: a mouse click also focuses, and the hover path handles that.
			if (node.matches(':focus-visible, :has(:focus-visible)')) show();
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') hide();
		}

		node.addEventListener('pointerenter', onPointerEnter);
		node.addEventListener('pointerleave', hide);
		node.addEventListener('pointerdown', hide);
		node.addEventListener('focusin', onFocusIn);
		node.addEventListener('focusout', hide);
		node.addEventListener('keydown', onKeyDown);
		window.addEventListener('scroll', hide, { passive: true, capture: true });

		return () => {
			node.removeEventListener('pointerenter', onPointerEnter);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('pointerdown', hide);
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', hide);
			node.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('scroll', hide, { capture: true });
			hide();
		};
	};
}
