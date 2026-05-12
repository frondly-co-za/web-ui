<script lang="ts">
	import { onMount } from 'svelte';
	import { plantClient } from '$lib/clients/plantClient';
	import PlantEditor from '$lib/components/plants/PlantEditor.svelte';
	import type { LocalPlant } from '$lib/db/types';

	let { data } = $props();

	let plant: LocalPlant | null = $state(null);

	onMount(async () => {
		plant = (await plantClient.getById(data.id)) ?? null;
	});
</script>

<PlantEditor {plant} />
