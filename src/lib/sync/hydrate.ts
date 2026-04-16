import { type Table } from 'dexie';
import { db } from '$lib/db';
import { apiFetch } from '$lib/api/apiFetch';
import type { ApiPlant, ApiCareType, ApiCareSchedule, ApiCareLog } from '$lib/api/types';
import type {
	SyncMeta,
	LocalPlant,
	LocalCareType,
	LocalCareSchedule,
	LocalCareLog
} from '$lib/db/types';

export async function hydrateFromApi(): Promise<void> {
	const [enrichedPlants, careTypes] = await Promise.all([
		apiFetch<ApiPlant[]>('/plants?include=schedules,recentLogs'),
		apiFetch<ApiCareType[]>('/care-types')
	]);

	await db.transaction('rw', db.plants, db.careTypes, db.careSchedules, db.careLogs, async () => {
		const pendingSet = async <T extends SyncMeta & { id: string }>(table: Table<T, string>) =>
			new Set((await table.where('syncPending').equals(1).toArray()).map((r) => r.id));

		const pendingPlantIds = await pendingSet(db.plants);
		const pendingTypeIds = await pendingSet(db.careTypes);
		const pendingScheduleIds = await pendingSet(db.careSchedules);
		const pendingLogIds = await pendingSet(db.careLogs);

		const syncMeta = { syncPending: 0 as const, syncDeleted: 0 as const, everSynced: 1 as const };

		const plants: ApiPlant[] = [];
		const schedules: ApiCareSchedule[] = [];
		const logs: ApiCareLog[] = [];

		for (const p of enrichedPlants) {
			plants.push(p);
			if (p.schedules) schedules.push(...p.schedules);
			if (p.recentLogs) logs.push(...p.recentLogs);
		}

		const serverPlantIds = new Set(plants.map((p) => p.id));
		const serverTypeIds = new Set(careTypes.map((t) => t.id));
		const serverScheduleIds = new Set(schedules.map((s) => s.id));
		const serverLogIds = new Set(logs.map((l) => l.id));

		// Remove synced local records absent from server response (deleted from another device)
		await db.plants.filter((p) => p.syncPending === 0 && !serverPlantIds.has(p.id)).delete();
		await db.careTypes.filter((t) => t.syncPending === 0 && !serverTypeIds.has(t.id)).delete();
		await db.careSchedules
			.filter((s) => s.syncPending === 0 && !serverScheduleIds.has(s.id))
			.delete();
		// Only clean up logs for plants we received — avoids falsely removing unhydrated logs
		await db.careLogs
			.filter(
				(l) => l.syncPending === 0 && serverPlantIds.has(l.plantId) && !serverLogIds.has(l.id)
			)
			.delete();

		await db.plants.bulkPut(
			plants
				.filter((p) => !pendingPlantIds.has(p.id))
				.map(
					(p) =>
						({
							id: p.id,
							name: p.name,
							description: p.description,
							acquiredAt: p.acquiredAt,
							notes: p.notes,
							coverPhotoId: p.coverPhotoId,
							updatedAt: p.updatedAt,
							localCreatedAt: new Date(p.createdAt).getTime(),
							...syncMeta
						}) satisfies LocalPlant
				)
		);

		await db.careTypes.bulkPut(
			careTypes
				.filter((t) => !pendingTypeIds.has(t.id))
				.map(
					(t) =>
						({
							id: t.id,
							name: t.name,
							options: t.options,
							isSystem: t.userId === null ? 1 : 0,
							updatedAt: t.updatedAt,
							localCreatedAt: new Date(t.createdAt).getTime(),
							...syncMeta
						}) satisfies LocalCareType
				)
		);

		await db.careSchedules.bulkPut(
			schedules
				.filter((s) => !pendingScheduleIds.has(s.id))
				.map(
					(s) =>
						({
							id: s.id,
							plantId: s.plantId,
							careTypeId: s.careTypeId,
							selectedOption: s.selectedOption,
							notes: s.notes,
							dayOfWeek: s.dayOfWeek,
							dayOfMonth: s.dayOfMonth,
							months: s.months,
							nextDue: s.nextDue,
							isActive: s.isActive,
							updatedAt: s.updatedAt,
							localCreatedAt: new Date(s.createdAt).getTime(),
							...syncMeta
						}) satisfies LocalCareSchedule
				)
		);

		await db.careLogs.bulkPut(
			logs
				.filter((l) => !pendingLogIds.has(l.id))
				.map(
					(l) =>
						({
							id: l.id,
							plantId: l.plantId,
							scheduleId: l.scheduleId,
							careTypeId: l.careTypeId,
							selectedOption: l.selectedOption,
							notes: l.notes,
							performedAt: l.performedAt,
							updatedAt: l.createdAt, // CareLog has no updatedAt — use createdAt as sentinel
							localCreatedAt: new Date(l.createdAt).getTime(),
							...syncMeta
						}) satisfies LocalCareLog
				)
		);
	});
}

export async function hydrateLogsForPlant(plantId: string): Promise<void> {
	const logs = await apiFetch<ApiCareLog[]>(`/plants/${plantId}/logs`);

	const pendingLogIds = new Set(
		(await db.careLogs.where('syncPending').equals(1).toArray()).map((l) => l.id)
	);

	const syncMeta = { syncPending: 0 as const, syncDeleted: 0 as const, everSynced: 1 as const };

	await db.careLogs.bulkPut(
		logs
			.filter((l) => !pendingLogIds.has(l.id))
			.map(
				(l) =>
					({
						id: l.id,
						plantId: l.plantId,
						scheduleId: l.scheduleId,
						careTypeId: l.careTypeId,
						selectedOption: l.selectedOption,
						notes: l.notes,
						performedAt: l.performedAt,
						updatedAt: l.createdAt,
						localCreatedAt: new Date(l.createdAt).getTime(),
						...syncMeta
					}) satisfies LocalCareLog
			)
	);
}
