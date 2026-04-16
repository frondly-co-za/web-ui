import { db } from '$lib/db';
import { generateId } from '$lib/db/generateId';
import type { LocalPlant } from '$lib/db/types';

type CreatePlantInput = Pick<LocalPlant, 'name' | 'description' | 'acquiredAt' | 'notes'>;
type UpdatePlantInput = Partial<CreatePlantInput>;

export const plantClient = {
	async getAll(): Promise<LocalPlant[]> {
		return db.plants.where('syncDeleted').equals(0).toArray();
	},

	async getById(id: string): Promise<LocalPlant | undefined> {
		return db.plants.get(id);
	},

	async create(input: CreatePlantInput): Promise<LocalPlant> {
		const now = new Date().toISOString();
		const plant: LocalPlant = {
			id: generateId(),
			name: input.name,
			description: input.description ?? null,
			acquiredAt: input.acquiredAt ?? null,
			notes: input.notes ?? null,
			coverPhotoId: null,
			syncPending: 1,
			syncDeleted: 0,
			everSynced: 0,
			updatedAt: now,
			localCreatedAt: Date.now()
		};
		await db.plants.add(plant);
		return plant;
	},

	async update(id: string, input: UpdatePlantInput): Promise<void> {
		await db.plants.update(id, {
			...input,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	},

	async delete(id: string): Promise<void> {
		await db.plants.update(id, {
			syncDeleted: 1,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	}
};
