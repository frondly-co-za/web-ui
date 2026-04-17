import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '$lib/db';
import { runSync, syncStats } from '$lib/sync/syncEngine';
import type { LocalPlant } from '$lib/db/types';

vi.mock('$lib/api/apiFetch', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/api/apiFetch')>();
	return { ...original, apiFetch: vi.fn() };
});

import { apiFetch, ApiError } from '$lib/api/apiFetch';
const mockApiFetch = vi.mocked(apiFetch);

function makePlant(partial: Partial<LocalPlant> & { id: string }): LocalPlant {
	return {
		name: 'Test Plant',
		description: null,
		acquiredAt: null,
		notes: null,
		coverPhotoId: null,
		syncPending: 1,
		syncDeleted: 0,
		everSynced: 1,
		updatedAt: '2026-01-01T00:00:00.000Z',
		localCreatedAt: Date.now(),
		...partial
	};
}

function makeServerPlant(id: string, name: string, updatedAt: string) {
	return {
		id,
		name,
		description: null,
		coverPhotoId: null,
		acquiredAt: null,
		notes: null,
		userId: 'user1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt
	};
}

beforeEach(async () => {
	await db.plants.clear();
	await db.careTypes.clear();
	await db.careSchedules.clear();
	await db.careLogs.clear();
	mockApiFetch.mockReset();
	syncStats.runs = 0;
	syncStats.successes = 0;
	syncStats.failures = 0;
	syncStats.conflicts = 0;
});

// Task 3.2 — stale updatedAt PATCH triggers server-wins

describe('PATCH 409 — stale updatedAt conflict', () => {
	it('overwrites local edit with server version and clears syncPending', async () => {
		const plant = makePlant({
			id: '000000000000000000000001',
			name: 'Local Edit',
			updatedAt: '2026-01-01T00:00:00.000Z' // stale vs server
		});
		await db.plants.add(plant);

		const serverVersion = makeServerPlant(plant.id, 'Server Version', '2026-04-17T09:00:00.000Z');

		mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (method === 'PATCH') throw new ApiError(409, 'Conflict');
			if (method === 'GET' && path === `/plants/${plant.id}`) return serverVersion;
			if (method === 'GET' && path === '/care-types') return [];
			throw new Error(`Unmocked call: ${method} ${path}`);
		});

		await runSync();

		const record = await db.plants.get(plant.id);
		expect(record?.name).toBe('Server Version');
		expect(record?.updatedAt).toBe(serverVersion.updatedAt);
		expect(record?.syncPending).toBe(0);
		expect(record?.syncDeleted).toBe(0);
		expect(record?.everSynced).toBe(1);
		expect(syncStats.conflicts).toBe(1);
		expect(syncStats.failures).toBe(0);
	});
});

// Task 3.3 — duplicate client-generated id on POST (race / retry)

describe('POST 409 — duplicate client-generated id', () => {
	it('fetches the existing server record and clears syncPending', async () => {
		// Record was never synced — everSynced: 0 means sync engine will POST
		const plant = makePlant({
			id: '000000000000000000000002',
			name: 'New Plant',
			everSynced: 0
		});
		await db.plants.add(plant);

		// Server already has a record with this id (from a previous attempt)
		const serverVersion = makeServerPlant(plant.id, plant.name, '2026-04-17T09:00:00.000Z');

		mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (method === 'POST') throw new ApiError(409, 'Duplicate key');
			if (method === 'GET' && path === `/plants/${plant.id}`) return serverVersion;
			if (method === 'GET' && path === '/care-types') return [];
			throw new Error(`Unmocked call: ${method} ${path}`);
		});

		await runSync();

		const record = await db.plants.get(plant.id);
		expect(record?.syncPending).toBe(0);
		// server-wins via mapPlant sets everSynced: 1 regardless of prior value
		expect(record?.everSynced).toBe(1);
		expect(record?.updatedAt).toBe(serverVersion.updatedAt);
		expect(syncStats.conflicts).toBe(1);
		expect(syncStats.failures).toBe(0);
	});

	it('handles the same id being retried a second time idempotently', async () => {
		// Both records have the same id — second run should also resolve cleanly
		const plant = makePlant({
			id: '000000000000000000000003',
			name: 'Retry Plant',
			everSynced: 0
		});
		await db.plants.add(plant);

		const serverVersion = makeServerPlant(plant.id, plant.name, '2026-04-17T09:00:00.000Z');

		mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (method === 'POST') throw new ApiError(409, 'Duplicate key');
			if (method === 'GET' && path === `/plants/${plant.id}`) return serverVersion;
			if (method === 'GET' && path === '/care-types') return [];
			throw new Error(`Unmocked call: ${method} ${path}`);
		});

		// First sync run
		await runSync();
		expect((await db.plants.get(plant.id))?.syncPending).toBe(0);

		// Second sync run — record is no longer pending, no API calls made for it
		mockApiFetch.mockReset();
		mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (method === 'GET' && path === '/care-types') return [];
			throw new Error(`Unexpected call on second run: ${method} ${path}`);
		});

		await runSync();

		expect((await db.plants.get(plant.id))?.syncPending).toBe(0);
	});
});
