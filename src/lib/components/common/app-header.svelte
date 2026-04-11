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

<header class="app-header">
	<div class="app-header__inner">
		<div class="app-header__brand">
			<img src={favicon} alt="" class="app-header__logo" aria-hidden="true" />
			<span class="app-header__title">{title}</span>
		</div>
		{#if actions}
			<div class="app-header__actions">
				{@render actions()}
			</div>
		{/if}
	</div>
</header>

<style>
	@reference '$routes/layout.css';

	.app-header {
		@apply border-b border-border bg-card;
		padding-top: env(safe-area-inset-top);
	}

	.app-header__inner {
		@apply flex h-14 items-center justify-between px-4;
	}

	.app-header__brand {
		@apply flex items-center gap-2;
	}

	.app-header__logo {
		@apply h-7 w-7;
	}

	.app-header__title {
		@apply text-base font-semibold text-foreground;
	}

	.app-header__actions {
		@apply flex items-center gap-2;
	}
</style>
