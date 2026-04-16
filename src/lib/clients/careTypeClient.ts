import { db } from '$lib/db';
import { generateId } from '$lib/db/generateId';
import type { LocalCareType } from '$lib/db/types';

type CreateCareTypeInput = Pick<LocalCareType, 'name' | 'options'>;
type UpdateCareTypeInput = Partial<CreateCareTypeInput>;

export const careTypeClient = {
	async getAll(): Promise<LocalCareType[]> {
		return db.careTypes.where('syncDeleted').equals(0).toArray();
	},

	async getById(id: string): Promise<LocalCareType | undefined> {
		return db.careTypes.get(id);
	},

	async create(input: CreateCareTypeInput): Promise<LocalCareType> {
		const now = new Date().toISOString();
		const careType: LocalCareType = {
			id: generateId(),
			name: input.name,
			options: input.options,
			isSystem: 0,
			syncPending: 1,
			syncDeleted: 0,
			everSynced: 0,
			updatedAt: now,
			localCreatedAt: Date.now()
		};
		await db.careTypes.add(careType);
		return careType;
	},

	async update(id: string, input: UpdateCareTypeInput): Promise<void> {
		await db.careTypes.update(id, {
			...input,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	},

	async delete(id: string): Promise<void> {
		await db.careTypes.update(id, {
			syncDeleted: 1,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	}
};
