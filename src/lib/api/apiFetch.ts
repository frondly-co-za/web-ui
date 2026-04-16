import { auth } from '$lib/auth.svelte';

const baseUrl = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function apiFetch<T = void>(path: string, init: RequestInit = {}): Promise<T> {
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
		throw new ApiError(response.status, await response.text());
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return response.json() as Promise<T>;
}

export const apiBaseUrl = baseUrl;
