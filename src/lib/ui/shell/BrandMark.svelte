<!--
@component
The app's mark: a key tile, its cap and a lit LED (our own drawing, no TE marks, see DECISIONS D6).
In the light theme the LED is drawn the guide's way, an ink dot. Decorative: name it beside it.
-->
<svg class="mark" viewBox="0 0 20 20" aria-hidden="true">
	<rect x="0.5" y="0.5" width="19" height="19" rx="2.5" class="mark__tile" />
	<circle cx="10" cy="10" r="5.8" class="mark__cap" />
	<circle cx="10" cy="6.6" r="1.15" class="mark__led" />
</svg>

<style>
	.mark {
		width: 1.25rem;
		height: 1.25rem;
		flex: none;
	}

	.mark__tile {
		fill: var(--xy-key-tile);
		stroke: var(--xy-line-strong);
		stroke-width: 1;
	}

	.mark__cap {
		fill: var(--xy-key-cap);
		stroke: rgb(0 0 0 / 0.35);
		stroke-width: 1;
	}

	.mark__led {
		fill: var(--xy-led-white);
		filter: drop-shadow(0 0 1.5px rgb(255 255 255 / 0.9));
	}

	:global([data-theme='light']) .mark__led {
		fill: var(--xy-ink);
		filter: none;
	}
</style>
