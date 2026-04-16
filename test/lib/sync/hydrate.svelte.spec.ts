import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '$lib/db';
import { plantClient } from '$lib/clients/plantClient';
import { hydrateFromApi } from '$lib/sync/hydrate';

vi.mock('$lib/api/apiFetch', () => ({
	apiFetch: vi.fn()
}));

import { apiFetch } from '$lib/api/apiFetch';

const mockApiFetch = vi.mocked(apiFetch);

const serverPlant = {
	id: '000000000000000000000001',
	name: 'Server Plant',
	description: null,
	acquiredAt: null,
	notes: null,
	coverPhotoId: null,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	schedules: [],
	recentLogs: []
};

describe('hydrateFromApi', () => {
	beforeEach(async () => {
		await db.plants.clear();
		await db.careTypes.clear();
		await db.careSchedules.clear();
		await db.careLogs.clear();
		mockApiFetch.mockReset();
	});

	it('populates plants from server response', async () => {
		mockApiFetch
			.mockResolvedValueOnce([serverPlant]) // enrichedPlants
			.mockResolvedValueOnce([]); // careTypes

		await hydrateFromApi();

		const plants = await db.plants.toArray();
		expect(plants).toHaveLength(1);
		expect(plants[0].id).toBe(serverPlant.id);
		expect(plants[0].syncPending).toBe(0);
		expect(plants[0].everSynced).toBe(1);
	});

	it('skips pending local records during hydration', async () => {
		// Create a local pending plant with same ID as server
		await db.plants.add({
			id: serverPlant.id,
			name: 'Local Pending Version',
			description: null,
			acquiredAt: null,
			notes: null,
			coverPhotoId: null,
			syncPending: 1,
			syncDeleted: 0,
			everSynced: 0,
			updatedAt: '2026-01-02T00:00:00.000Z',
			localCreatedAt: Date.now()
		});

		mockApiFetch.mockResolvedValueOnce([serverPlant]).mockResolvedValueOnce([]);

		await hydrateFromApi();

		// Pending record should NOT be overwritten
		const plant = await db.plants.get(serverPlant.id);
		expect(plant?.name).toBe('Local Pending Version');
		expect(plant?.syncPending).toBe(1);
	});

	it('removes synced local records absent from server (deleted elsewhere)', async () => {
		// Add a synced record not in server response
		const ghostId = '000000000000000000000099';
		await db.plants.add({
			id: ghostId,
			name: 'Ghost Plant',
			description: null,
			acquiredAt: null,
			notes: null,
			coverPhotoId: null,
			syncPending: 0,
			syncDeleted: 0,
			everSynced: 1,
			updatedAt: '2026-01-01T00:00:00.000Z',
			localCreatedAt: Date.now()
		});

		mockApiFetch.mockResolvedValueOnce([serverPlant]).mockResolvedValueOnce([]);

		await hydrateFromApi();

		const ghost = await db.plants.get(ghostId);
		expect(ghost).toBeUndefined();
	});

	it('preserves pending tombstones during hydration', async () => {
		const localPlant = await plantClient.create({
			name: 'Pending Delete',
			description: null,
			acquiredAt: null,
			notes: null
		});
		await plantClient.delete(localPlant.id);

		// Server does not know about this plant yet
		mockApiFetch.mockResolvedValueOnce([serverPlant]).mockResolvedValueOnce([]);

		await hydrateFromApi();

		// Pending tombstone must survive
		const record = await db.plants.get(localPlant.id);
		expect(record?.syncDeleted).toBe(1);
		expect(record?.syncPending).toBe(1);
	});
});
