import { connectivity } from '$lib/stores/connectivity.svelte';
import { auth } from '$lib/auth.svelte';
import { runSync } from './syncEngine';
import { hydrateFromApi } from './hydrate';

export function initSyncTrigger() {
	let previousOnline = connectivity.online;

	$effect(() => {
		const isOnline = connectivity.online;
		if (isOnline && !previousOnline && auth.isAuthenticated) {
			runSync().then(() => hydrateFromApi());
		}
		previousOnline = isOnline;
	});
}
