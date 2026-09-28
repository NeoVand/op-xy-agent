<!--
@component
An icon from Hugeicons' free set (MIT, `@hugeicons/core-free-icons`), for the site around the
replica: navigation, toggles, links. Keys drawn as OP-XY keys keep our own legends (`Icon`). It
follows the text: `1.125em` and `currentColor` by default, decorative (hidden from assistive
technology; the control around it carries the name).

```svelte
<script lang="ts">
	import { BookOpen01Icon } from '@hugeicons/core-free-icons';
</script>

<HugeIcon icon={BookOpen01Icon} />
```
-->
<script lang="ts">
	import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/svelte';

	interface Props {
		icon: IconSvgElement;
		/** CSS length or pixels. */
		size?: string | number;
		/** Stroke on the 24-unit grid. */
		strokeWidth?: number;
		class?: string;
	}

	let { icon, size = '1.125em', strokeWidth = 1.6, class: className = '' }: Props = $props();
</script>

<span class={['hugeicon', className]} aria-hidden="true">
	<HugeiconsIcon {icon} {size} {strokeWidth} color="currentColor" />
</span>

<style>
	.hugeicon {
		display: inline-flex;
		flex: none;
		line-height: 0;
	}
</style>
