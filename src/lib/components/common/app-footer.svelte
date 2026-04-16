<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children?: Snippet;
	} = $props();
</script>

<footer class="border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
	{#if children}
		<nav class="flex h-14 items-center justify-around px-2" aria-label="Main navigation">
			{@render children()}
		</nav>
	{/if}
</footer>
