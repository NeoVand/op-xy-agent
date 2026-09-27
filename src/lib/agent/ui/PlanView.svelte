<!--
@component
The agent's plan for a multi-step job (`write_todos`) as a checklist with step LEDs: off for
pending, blinking for the step in progress, lit when done.
-->
<script lang="ts">
	import Led from '$lib/ui/Led.svelte';
	import type { Todo } from '../types';

	interface Props {
		todos: readonly Todo[];
	}

	let { todos }: Props = $props();

	const done = $derived(todos.filter((t) => t.status === 'completed').length);
	const uid = $props.id();
</script>

<section class="plan" aria-labelledby="{uid}-title">
	<h3 class="plan__title" id="{uid}-title">
		plan <span class="plan__count">{done} of {todos.length} done</span>
	</h3>
	<ol class="plan__list">
		{#each todos as todo, i (i)}
			<li class={['plan__item', `plan__item--${todo.status}`]}>
				<Led
					state={todo.status === 'completed'
						? 'white'
						: todo.status === 'in_progress'
							? 'white'
							: 'off'}
					blink={todo.status === 'in_progress' ? 'breathe' : false}
					size="sm"
					label={todo.status === 'completed'
						? 'done'
						: todo.status === 'in_progress'
							? 'in progress'
							: 'to do'}
				/>
				<span>{todo.content}</span>
			</li>
		{/each}
	</ol>
</section>

<style>
	.plan {
		padding: 0.625rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		box-shadow: var(--xy-shadow-recess);
	}

	.plan__title {
		display: flex;
		justify-content: space-between;
		margin: 0 0 0.375rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.plan__count {
		color: var(--xy-fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	.plan__list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.plan__item {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.125rem 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.plan__item :global(.led) {
		align-self: center;
	}

	.plan__item--in_progress {
		color: var(--xy-fg);
	}

	.plan__item--completed {
		color: var(--xy-fg-subtle);
	}
</style>
