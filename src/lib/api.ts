import { auth } from '$lib/auth.svelte';

const baseUrl = import.meta.env.VITE_API_BASE_URL;

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = await auth.getAccessToken();

	const response = await fetch(`${baseUrl}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init.headers,
			Authorization: `Bearer ${token}`
		}
	});

	if (!response.ok) {
		throw new Error(`API error ${response.status}: ${await response.text()}`);
	}

	return response.json() as Promise<T>;
}

export const api = {
	get: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, { ...init, method: 'GET' }),
	post: <T>(path: string, body: unknown, init?: RequestInit) =>
		apiFetch<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) }),
	put: <T>(path: string, body: unknown, init?: RequestInit) =>
		apiFetch<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) }),
	patch: <T>(path: string, body: unknown, init?: RequestInit) =>
		apiFetch<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) }),
	delete: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, { ...init, method: 'DELETE' }),

	health: () => api.get<{ status: string }>('/health')
};
