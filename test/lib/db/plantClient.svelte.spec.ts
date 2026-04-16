import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { plantClient } from '$lib/clients/plantClient';

async function clearDb() {
	await db.plants.clear();
}

describe('plantClient', () => {
	beforeEach(clearDb);

	it('creates a plant with correct sync metadata', async () => {
		const plant = await plantClient.create({
			name: 'Fern',
			description: null,
			acquiredAt: null,
			notes: null
		});

		expect(plant.name).toBe('Fern');
		expect(plant.syncPending).toBe(1);
		expect(plant.syncDeleted).toBe(0);
		expect(plant.everSynced).toBe(0);
		expect(plant.id).toMatch(/^[0-9a-f]{24}$/);
	});

	it('getAll excludes soft-deleted records', async () => {
		const plant = await plantClient.create({
			name: 'Cactus',
			description: null,
			acquiredAt: null,
			notes: null
		});
		await plantClient.delete(plant.id);

		const all = await plantClient.getAll();
		expect(all.find((p) => p.id === plant.id)).toBeUndefined();
	});

	it('delete marks record as tombstone', async () => {
		const plant = await plantClient.create({
			name: 'Rose',
			description: null,
			acquiredAt: null,
			notes: null
		});
		await plantClient.delete(plant.id);

		const record = await plantClient.getById(plant.id);
		expect(record?.syncDeleted).toBe(1);
		expect(record?.syncPending).toBe(1);
	});

	it('update sets syncPending without changing everSynced', async () => {
		const plant = await plantClient.create({
			name: 'Oak',
			description: null,
			acquiredAt: null,
			notes: null
		});
		// Simulate a synced record
		await db.plants.update(plant.id, { syncPending: 0, everSynced: 1 });

		await plantClient.update(plant.id, { name: 'Oak Tree' });

		const updated = await plantClient.getById(plant.id);
		expect(updated?.name).toBe('Oak Tree');
		expect(updated?.syncPending).toBe(1);
		expect(updated?.everSynced).toBe(1);
	});
});
