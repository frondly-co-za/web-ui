<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { pwaInfo } from 'virtual:pwa-info';
	import favicon from '$lib/assets/favicon.svg';
	import { AppHeader, AppFooter, AuthButton, ModeToggle } from '$lib/components/common';

	let { children } = $props();

	const webManifest = $derived(pwaInfo?.webManifest);

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({ immediate: true });
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" href="/icon-apple.png" />
	{#if webManifest}
		<link
			rel="manifest"
			href={webManifest.href}
			crossorigin={webManifest.useCredentials ? 'use-credentials' : undefined}
		/>
	{/if}
</svelte:head>
<ModeWatcher />

<div class="app-shell">
	<AppHeader>
		{#snippet actions()}
			<AuthButton />
			<ModeToggle />
		{/snippet}
	</AppHeader>

	<main class="app-content">
		{@render children()}
	</main>

	<AppFooter />
</div>
