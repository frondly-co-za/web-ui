import { apiBaseUrl } from '$lib/api/apiFetch';

function createConnectivityStore() {
	let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
	let verifying = $state(false);

	async function probe(): Promise<boolean> {
		try {
			const res = await fetch(`${apiBaseUrl}/health`, {
				method: 'HEAD',
				cache: 'no-store',
				signal: AbortSignal.timeout(5000)
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async function handleOnline() {
		verifying = true;
		online = await probe();
		verifying = false;
	}

	function handleOffline() {
		online = false; // trusted immediately — no probe needed
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
	}

	return {
		get online() {
			return online;
		},
		get verifying() {
			return verifying;
		}
	};
}

export const connectivity = createConnectivityStore();
