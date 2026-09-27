<!--
@component
Test harness (browser tests only): the app's replica wired to an `AppSimulator`, the way the root
layout and the home page wire them, so conformance tests click the real replica and read what it
shows. See `app-driver.ts`.
-->
<script lang="ts">
	import { Replica, type ReplicaState } from '$lib/replica';
	import { setScreenFrameSource } from '$lib/replica/screen';
	import type { AppSimulator } from '../simulator.svelte';

	interface Props {
		replica: ReplicaState;
		simulator: AppSimulator;
	}

	let { replica, simulator }: Props = $props();

	// svelte-ignore state_referenced_locally
	setScreenFrameSource(simulator);
</script>

<div style="width: 960px">
	<Replica {replica} grain={false} />
</div>
