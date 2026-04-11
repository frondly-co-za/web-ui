<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children?: Snippet;
	} = $props();
</script>

<footer class="app-footer">
	{#if children}
		<nav class="app-footer__nav" aria-label="Main navigation">
			{@render children()}
		</nav>
	{/if}
</footer>

<style>
	@reference '$routes/layout.css';

	.app-footer {
		@apply border-t border-border bg-card;
		padding-bottom: env(safe-area-inset-bottom);
	}

	.app-footer__nav {
		@apply flex h-14 items-center justify-around px-2;
	}
</style>
