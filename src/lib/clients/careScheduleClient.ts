import { db } from '$lib/db';
import { generateId } from '$lib/db/generateId';
import type { LocalCareSchedule } from '$lib/db/types';

type CreateScheduleInput = Pick<
	LocalCareSchedule,
	'plantId' | 'careTypeId' | 'selectedOption' | 'notes' | 'dayOfWeek' | 'dayOfMonth' | 'months'
>;
type UpdateScheduleInput = Partial<Omit<CreateScheduleInput, 'plantId'> & { isActive: boolean }>;

export const careScheduleClient = {
	async getAll(): Promise<LocalCareSchedule[]> {
		return db.careSchedules.where('syncDeleted').equals(0).toArray();
	},

	async getByPlantId(plantId: string): Promise<LocalCareSchedule[]> {
		return db.careSchedules
			.where('plantId')
			.equals(plantId)
			.and((s) => s.syncDeleted === 0)
			.toArray();
	},

	async getById(id: string): Promise<LocalCareSchedule | undefined> {
		return db.careSchedules.get(id);
	},

	async create(input: CreateScheduleInput): Promise<LocalCareSchedule> {
		const now = new Date().toISOString();
		const schedule: LocalCareSchedule = {
			id: generateId(),
			plantId: input.plantId,
			careTypeId: input.careTypeId,
			selectedOption: input.selectedOption ?? null,
			notes: input.notes ?? null,
			dayOfWeek: input.dayOfWeek,
			dayOfMonth: input.dayOfMonth,
			months: input.months,
			nextDue: now, // locally approximated; replaced by server value after sync
			isActive: true,
			syncPending: 1,
			syncDeleted: 0,
			everSynced: 0,
			updatedAt: now,
			localCreatedAt: Date.now()
		};
		await db.careSchedules.add(schedule);
		return schedule;
	},

	async update(id: string, input: UpdateScheduleInput): Promise<void> {
		await db.careSchedules.update(id, {
			...input,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	},

	async getUpcoming(withinDays = 30, limit = 10): Promise<LocalCareSchedule[]> {
		const horizon = new Date();
		horizon.setDate(horizon.getDate() + withinDays);
		return db.careSchedules
			.filter((s) => s.syncDeleted === 0 && s.nextDue <= horizon.toISOString())
			.sortBy('nextDue')
			.then((results) => results.slice(0, limit));
	},

	async delete(id: string): Promise<void> {
		await db.careSchedules.update(id, {
			syncDeleted: 1,
			syncPending: 1,
			updatedAt: new Date().toISOString()
		});
	}
};
