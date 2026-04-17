import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '$lib/db';
import { runSync, syncStats } from '$lib/sync/syncEngine';
import { hydrateFromApi } from '$lib/sync/hydrate';
import type { LocalPlant } from '$lib/db/types';

vi.mock('$lib/api/apiFetch', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/api/apiFetch')>();
	return { ...original, apiFetch: vi.fn() };
});

import { apiFetch } from '$lib/api/apiFetch';
const mockApiFetch = vi.mocked(apiFetch);

function makePlant(partial: Partial<LocalPlant> & { id: string }): LocalPlant {
	return {
		name: 'Test Plant',
		description: null,
		acquiredAt: null,
		notes: null,
		coverPhotoId: null,
		syncPending: 0,
		syncDeleted: 0,
		everSynced: 1,
		updatedAt: '2026-01-01T00:00:00.000Z',
		localCreatedAt: Date.now(),
		...partial
	};
}

function makeServerPlant(id: string, name: string, updatedAt = '2026-04-17T10:00:00.000Z') {
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

describe('reconnect sync + hydrate flow', () => {
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

	it('syncs pending creates, updates, and deletes then hydrates clean state', async () => {
		const now = Date.now();

		// Three plants in different pending states, ordered by localCreatedAt
		const plantA = makePlant({
			id: '000000000000000000000001',
			name: 'New Plant (offline)',
			syncPending: 1,
			everSynced: 0,
			localCreatedAt: now
		});
		const plantB = makePlant({
			id: '000000000000000000000002',
			name: 'Updated Plant (offline)',
			syncPending: 1,
			everSynced: 1,
			localCreatedAt: now + 1
		});
		const plantC = makePlant({
			id: '000000000000000000000003',
			name: 'Deleted Plant (offline)',
			syncPending: 1,
			syncDeleted: 1,
			everSynced: 1,
			localCreatedAt: now + 2
		});

		await db.plants.bulkAdd([plantA, plantB, plantC]);

		const serverA = makeServerPlant(plantA.id, plantA.name, '2026-04-17T10:00:00.000Z');
		const serverB = makeServerPlant(
			plantB.id,
			'Updated Plant (server)',
			'2026-04-17T10:00:01.000Z'
		);

		mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (method === 'POST' && path === '/plants') return serverA;
			if (method === 'PATCH' && path === `/plants/${plantB.id}`) return serverB;
			if (method === 'DELETE' && path === `/plants/${plantC.id}`) return undefined;
			if (method === 'GET' && path.startsWith('/plants?include=')) {
				return [
					{ ...serverA, schedules: [], recentLogs: [] },
					{ ...serverB, schedules: [], recentLogs: [] }
				];
			}
			if (method === 'GET' && path === '/care-types') return [];
			throw new Error(`Unmocked call: ${method} ${path}`);
		});

		await runSync();

		// plantA: created via POST — now confirmed
		const syncedA = await db.plants.get(plantA.id);
		expect(syncedA?.syncPending).toBe(0);
		expect(syncedA?.everSynced).toBe(1);
		expect(syncedA?.updatedAt).toBe(serverA.updatedAt);

		// plantB: updated via PATCH — updatedAt from server response
		const syncedB = await db.plants.get(plantB.id);
		expect(syncedB?.syncPending).toBe(0);
		expect(syncedB?.updatedAt).toBe(serverB.updatedAt);

		// plantC: tombstone removed after DELETE confirmed
		expect(await db.plants.get(plantC.id)).toBeUndefined();

		await hydrateFromApi();

		// Only plantA and plantB exist after hydration
		const plants = await db.plants.where('syncDeleted').equals(0).toArray();
		expect(plants).toHaveLength(2);
		expect(plants.map((p) => p.id).sort()).toEqual([plantA.id, plantB.id].sort());

		expect(syncStats.failures).toBe(0);
		expect(syncStats.conflicts).toBe(0);
	});
});
