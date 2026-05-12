<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { pwaInfo } from 'virtual:pwa-info';
	import favicon from '$lib/assets/favicon.svg';
	import {
		AppHeader,
		AppFooter,
		AuthButton,
		ConnectivityPill,
		ModeToggle
	} from '$lib/components/common';
	import { footerStore } from '$lib/stores/footer.svelte';
	import { initSyncTrigger } from '$lib/sync/syncTrigger.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Home01Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';

	let { children } = $props();

	const webManifest = $derived(pwaInfo?.webManifest);

	initSyncTrigger();

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

<div
	class="flex h-dvh flex-col overflow-hidden pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
>
	<AppHeader>
		{#snippet actions()}
			<ConnectivityPill />
			<AuthButton />
			<ModeToggle />
		{/snippet}
	</AppHeader>

	<main class="flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
		{@render children()}
	</main>

	<AppFooter>
		{#if footerStore.snippet}
			{@render footerStore.snippet()}
		{:else}
			<Button href="/" variant="ghost" class="h-auto flex-col gap-1 rounded-full px-5 py-2">
				<HugeiconsIcon icon={Home01Icon} color="currentColor" strokeWidth={1.5} class="size-6" />
				Home
			</Button>
		{/if}
	</AppFooter>
</div>
