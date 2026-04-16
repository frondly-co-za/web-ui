<script lang="ts">
	import type { Snippet } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';

	let {
		title = 'Frondly',
		actions
	}: {
		title?: string;
		actions?: Snippet;
	} = $props();
</script>

<header class="border-b border-border bg-card pt-[env(safe-area-inset-top)]">
	<div class="flex h-14 items-center justify-between px-4">
		<div class="flex items-center gap-2">
			<img src={favicon} alt="" class="h-7 w-7" aria-hidden="true" />
			<span class="text-base font-semibold text-foreground">{title}</span>
		</div>
		{#if actions}
			<div class="flex items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</div>
</header>
