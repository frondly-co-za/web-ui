<script lang="ts">
	import { Container } from '$lib/components/common';
	import WeatherWidget from '$lib/components/weather/WeatherWidget.svelte';
	import UpcomingCare from '$lib/components/dashboard/UpcomingCare.svelte';
	import MyPlants from '$lib/components/dashboard/MyPlants.svelte';
	import { footerStore } from '$lib/stores/footer.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Plant01Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';

	$effect(() => {
		footerStore.set(homeFooter);
		return () => footerStore.set(undefined);
	});
</script>

{#snippet homeFooter()}
	<Button
		href="/plants/new"
		variant="ghost"
		class="h-auto flex-col gap-1 rounded-full px-5 py-2"
	>
		<HugeiconsIcon icon={Plant01Icon} color="currentColor" strokeWidth={1.5} class="size-6" />
		Add plant
	</Button>
{/snippet}

<Container>
	<WeatherWidget />
	<UpcomingCare />
	<MyPlants />
</Container>
