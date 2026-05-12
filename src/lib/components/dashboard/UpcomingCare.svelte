<script lang="ts">
	import { onMount } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Leaf01Icon,
		DropletIcon,
		FlowerPotIcon,
		SquareBottomDashedScissorsIcon,
		CheckmarkCircle01Icon
	} from '@hugeicons/core-free-icons';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { careScheduleClient } from '$lib/clients/careScheduleClient';
	import { careTypeClient } from '$lib/clients/careTypeClient';
	import { plantClient } from '$lib/clients/plantClient';
	import { careLogClient } from '$lib/clients/careLogClient';
	import type { LocalCareSchedule, LocalPlant, LocalCareType } from '$lib/db/types';

	interface EnrichedSchedule {
		schedule: LocalCareSchedule;
		plant: LocalPlant | undefined;
		careType: LocalCareType | undefined;
		label: string;
		isOverdue: boolean;
	}

	type State =
		| { status: 'loading' }
		| { status: 'empty' }
		| { status: 'ready'; items: EnrichedSchedule[] };

	let viewState: State = $state({ status: 'loading' });
	let markedDone = $state(new Set<string>());

	function relativeLabel(isoDate: string): { label: string; isOverdue: boolean } {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const due = new Date(isoDate);
		const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
		const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

		if (diffDays < 0) {
			const n = Math.abs(diffDays);
			return { label: `${n} day${n === 1 ? '' : 's'} overdue`, isOverdue: true };
		}
		if (diffDays === 0) return { label: 'Today', isOverdue: false };
		if (diffDays === 1) return { label: 'Tomorrow', isOverdue: false };
		return { label: `In ${diffDays} days`, isOverdue: false };
	}

	function iconForCareType(name: string) {
		const n = name.toLowerCase();
		if (n.includes('water') || n.includes('mist')) return DropletIcon;
		if (n.includes('prun') || n.includes('trim') || n.includes('cut'))
			return SquareBottomDashedScissorsIcon;
		if (n.includes('repot') || n.includes('pot') || n.includes('fertil')) return FlowerPotIcon;
		return Leaf01Icon;
	}

	async function load() {
		const schedules = await careScheduleClient.getUpcoming();
		if (schedules.length === 0) {
			viewState = { status: 'empty' };
			return;
		}

		const [plants, careTypes] = await Promise.all([plantClient.getAll(), careTypeClient.getAll()]);
		const plantMap = new Map(plants.map((p) => [p.id, p]));
		const careTypeMap = new Map(careTypes.map((ct) => [ct.id, ct]));

		const items: EnrichedSchedule[] = schedules.map((s) => {
			const { label, isOverdue } = relativeLabel(s.nextDue);
			return {
				schedule: s,
				plant: plantMap.get(s.plantId),
				careType: careTypeMap.get(s.careTypeId),
				label,
				isOverdue
			};
		});

		viewState = { status: 'ready', items };
	}

	async function markDone(item: EnrichedSchedule) {
		markedDone = new Set([...markedDone, item.schedule.id]);
		await careLogClient.create({
			plantId: item.schedule.plantId,
			careTypeId: item.schedule.careTypeId,
			scheduleId: item.schedule.id,
			selectedOption: item.schedule.selectedOption,
			notes: null,
			performedAt: new Date().toISOString()
		});
	}

	onMount(() => {
		load();
	});

	const SKELETON_COUNT = 3;
</script>

<Card.Root>
	<Card.Header class="pb-2">
		<Card.Title class="text-base">Upcoming Care</Card.Title>
	</Card.Header>
	<Card.Content class="px-6 pb-4">
		{#if viewState.status === 'loading'}
			<div class="flex flex-col gap-3">
				{#each Array(SKELETON_COUNT) as _}
					<div class="flex items-center gap-3">
						<Skeleton class="h-8 w-8 shrink-0 rounded-full" />
						<div class="flex flex-1 flex-col gap-1.5">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-3.5 w-20" />
						</div>
						<Skeleton class="h-5 w-16 rounded-full" />
					</div>
				{/each}
			</div>
		{:else if viewState.status === 'empty'}
			<p class="text-sm text-muted-foreground">No upcoming care in the next 30 days.</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each viewState.items.filter((i) => !markedDone.has(i.schedule.id)) as item (item.schedule.id)}
					<div
						class="flex items-center gap-3 rounded-lg border px-3 py-2.5"
						class:border-l-4={item.isOverdue}
						class:border-l-destructive={item.isOverdue}
					>
						<div class="shrink-0 text-primary">
							<HugeiconsIcon
								icon={item.careType ? iconForCareType(item.careType.name) : Leaf01Icon}
								color="currentColor"
								strokeWidth={1.5}
								class="h-5 w-5"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-foreground">
								{item.plant?.name ?? 'Unknown plant'}
							</p>
							<p class="text-xs text-muted-foreground">{item.careType?.name ?? 'Care'}</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<span
								class="text-xs {item.isOverdue
									? 'font-medium text-destructive'
									: 'text-muted-foreground'}"
							>
								{item.label}
							</span>
							<button
								onclick={() => markDone(item)}
								class="text-muted-foreground transition-colors hover:text-primary"
								aria-label="Mark done"
							>
								<HugeiconsIcon
									icon={CheckmarkCircle01Icon}
									color="currentColor"
									strokeWidth={1.5}
									class="h-5 w-5"
								/>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
