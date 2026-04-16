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

<div class="flex flex-col overflow-hidden h-[100dvh] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
	<AppHeader>
		{#snippet actions()}
			<AuthButton />
			<ModeToggle />
		{/snippet}
	</AppHeader>

	<main class="flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
		{@render children()}
	</main>

	<AppFooter />
</div>
