<script lang="ts">
	import AgentPanel from '$lib/ui/shell/AgentPanel.svelte';
	import DeviceStage from '$lib/ui/shell/DeviceStage.svelte';
	import { getShellStatus } from '$lib/ui/shell/status.svelte';

	const status = getShellStatus();

	// The Web MIDI layer will pass `onconnect` to DeviceStage; until then the connect key stays
	// disabled and says "coming soon". Nothing on this page requests MIDI access.
</script>

<svelte:head>
	<title>OP-XY Agent</title>
	<meta
		name="description"
		content="Learn, play and program the OP-XY with a replica of the instrument and an agent that knows its manual."
	/>
</svelte:head>

<div class="home">
	<section class="home__stage" aria-label="device">
		<DeviceStage webMidi={status.webMidi} />
	</section>
	<AgentPanel class="home__agent" />
</div>

<style>
	.home {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--xy-agent-w);
		min-height: 0;
	}

	.home__stage {
		display: grid;
		align-content: center;
		min-width: 0;
		padding: clamp(2rem, 5vh, 4rem) clamp(1rem, 4vw, 4rem);
	}

	.home :global(.home__agent) {
		margin: 0.75rem 0.75rem 0.75rem 0;
	}

	/* Desktop: the page is exactly one screen; the conversation scrolls inside its panel. */
	@media (min-width: 68.75rem) {
		.home {
			height: calc(100dvh - var(--xy-header-h) - var(--xy-status-h));
			min-height: 36rem;
		}
	}

	@media (max-width: 68.6875rem) {
		.home {
			grid-template-columns: minmax(0, 1fr);
		}

		.home :global(.home__agent) {
			min-height: 30rem;
			margin: 0 1rem 1rem;
		}
	}
</style>
