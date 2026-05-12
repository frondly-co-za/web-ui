<script lang="ts">
	import { onMount } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Plant01Icon, AddCircleIcon } from '@hugeicons/core-free-icons';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Button } from '$lib/components/ui/button';
	import { plantClient } from '$lib/clients/plantClient';
	import { careLogClient } from '$lib/clients/careLogClient';
	import type { LocalPlant } from '$lib/db/types';

	interface PlantWithLastCare {
		plant: LocalPlant;
		lastCareAt: string | null;
	}

	type ViewState =
		| { status: 'loading' }
		| { status: 'empty' }
		| { status: 'ready'; items: PlantWithLastCare[] };

	let viewState: ViewState = $state({ status: 'loading' });

	function formatLastCare(isoDate: string): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const d = new Date(isoDate);
		const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 30) return `${diffDays} days ago`;
		return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}

	async function load() {
		const [plants, logs] = await Promise.all([plantClient.getAll(), careLogClient.getAll()]);

		if (plants.length === 0) {
			viewState = { status: 'empty' };
			return;
		}

		const lastCareByPlant = new Map<string, string>();
		for (const log of logs) {
			const existing = lastCareByPlant.get(log.plantId);
			if (!existing || log.performedAt > existing) {
				lastCareByPlant.set(log.plantId, log.performedAt);
			}
		}

		const items: PlantWithLastCare[] = plants.map((plant) => ({
			plant,
			lastCareAt: lastCareByPlant.get(plant.id) ?? null
		}));

		viewState = { status: 'ready', items };
	}

	onMount(() => {
		load();
	});

	const SKELETON_COUNT = 4;
</script>

<Card.Root>
	<Card.Header class="pb-2">
		<Card.Title class="text-base">My Plants</Card.Title>
		<Card.Action>
			<Button href="/plants/new" variant="outline" size="sm">
				<HugeiconsIcon icon={AddCircleIcon} color="currentColor" strokeWidth={1.5} />
				Add plant
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content class="px-6 pb-4">
		{#if viewState.status === 'loading'}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each Array(SKELETON_COUNT) as _}
					<div class="flex flex-col gap-2 rounded-lg border p-3">
						<Skeleton class="aspect-square w-full rounded-md" />
						<Skeleton class="h-4 w-3/4" />
						<Skeleton class="h-3.5 w-1/2" />
					</div>
				{/each}
			</div>
		{:else if viewState.status === 'empty'}
			<p class="text-sm text-muted-foreground">
				No plants yet. Add your first plant to get started.
			</p>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each viewState.items as { plant, lastCareAt } (plant.id)}
					<a
						href="/plants/{plant.id}"
						class="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-accent"
					>
						<div
							class="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground"
						>
							<HugeiconsIcon
								icon={Plant01Icon}
								color="currentColor"
								strokeWidth={1.5}
								class="h-10 w-10"
							/>
						</div>
						<p class="truncate text-sm font-medium text-foreground">{plant.name}</p>
						<p class="text-xs text-muted-foreground">
							{#if lastCareAt}
								Last care: {formatLastCare(lastCareAt)}
							{:else}
								No care logged
							{/if}
						</p>
					</a>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
