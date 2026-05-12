<script lang="ts">
	import { connectivity } from '$lib/stores/connectivity.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
</script>

{#if connectivity.verifying}
	<span
		class="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
	>
		<Spinner class="size-3" />
		Checking
	</span>
{:else if connectivity.online}
	<span
		class="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"
	>
		<span class="size-1.5 rounded-full bg-primary"></span>
		Online
	</span>
{:else}
	<span
		class="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive"
	>
		<span class="size-1.5 rounded-full bg-destructive"></span>
		Offline
	</span>
{/if}
