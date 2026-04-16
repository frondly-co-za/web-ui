import { db } from '$lib/db';
import { generateId } from '$lib/db/generateId';
import type { LocalCareLog } from '$lib/db/types';

type CreateLogInput = Pick<
	LocalCareLog,
	'plantId' | 'careTypeId' | 'scheduleId' | 'selectedOption' | 'notes' | 'performedAt'
>;

export const careLogClient = {
	async getAll(): Promise<LocalCareLog[]> {
		return db.careLogs.where('syncDeleted').equals(0).toArray();
	},

	async getByPlantId(plantId: string): Promise<LocalCareLog[]> {
		return db.careLogs
			.where('plantId')
			.equals(plantId)
			.and((l) => l.syncDeleted === 0)
			.toArray();
	},

	async getById(id: string): Promise<LocalCareLog | undefined> {
		return db.careLogs.get(id);
	},

	async create(input: CreateLogInput): Promise<LocalCareLog> {
		const now = new Date().toISOString();
		const log: LocalCareLog = {
			id: generateId(),
			plantId: input.plantId,
			careTypeId: input.careTypeId,
			scheduleId: input.scheduleId ?? null,
			selectedOption: input.selectedOption ?? null,
			notes: input.notes ?? null,
			performedAt: input.performedAt,
			syncPending: 1,
			syncDeleted: 0,
			everSynced: 0,
			updatedAt: now, // sentinel — logs are immutable; updatedAt synced back from createdAt
			localCreatedAt: Date.now()
		};
		await db.careLogs.add(log);
		return log;
	},

	// No update() — the API only supports create and delete for logs

	async delete(id: string): Promise<void> {
		await db.careLogs.update(id, {
			syncDeleted: 1,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	}
};
