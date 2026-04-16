import { type Table } from 'dexie';
import { db } from '$lib/db';
import { apiFetch, ApiError } from '$lib/api/apiFetch';
import type { ApiPlant, ApiCareType, ApiCareSchedule, ApiCareLog } from '$lib/api/types';
import type { LocalPlant, LocalCareType, LocalCareSchedule } from '$lib/db/types';

let syncing = false;

export const syncStats = {
	runs: 0,
	successes: 0,
	failures: 0,
	conflicts: 0
};

export async function runSync(): Promise<void> {
	if (syncing) return;
	syncing = true;
	syncStats.runs++;
	console.log('[sync] starting run', syncStats.runs);
	try {
		await Promise.all([syncPlants(), syncCareTypes()]);
		await syncCareSchedules();
		await syncCareLogs();
		syncStats.successes++;
		console.log('[sync] run complete', syncStats);
	} catch (err) {
		syncStats.failures++;
		console.error('[sync] run failed', err, syncStats);
	} finally {
		syncing = false;
	}
}

// --- Plants ---

async function syncPlants(): Promise<void> {
	const pending = await db.plants.where('syncPending').equals(1).toArray();
	const toWrite = pending.filter((r) => r.syncDeleted === 0).sort(byCreatedAt);
	const toDelete = pending.filter((r) => r.syncDeleted === 1).sort(byCreatedAt);

	for (const record of toWrite) {
		try {
			if (record.everSynced === 0) {
				const body = await apiFetch<ApiPlant>('/plants', {
					method: 'POST',
					body: JSON.stringify({
						id: record.id,
						name: record.name,
						description: record.description,
						acquiredAt: record.acquiredAt,
						notes: record.notes
					})
				});
				await db.plants.update(record.id, {
					syncPending: 0,
					everSynced: 1,
					updatedAt: body.updatedAt
				});
			} else {
				const body = await apiFetch<ApiPlant>(`/plants/${record.id}`, {
					method: 'PATCH',
					body: JSON.stringify({
						name: record.name,
						description: record.description,
						acquiredAt: record.acquiredAt,
						notes: record.notes,
						updatedAt: record.updatedAt
					})
				});
				await db.plants.update(record.id, { syncPending: 0, updatedAt: body.updatedAt });
			}
		} catch (err: unknown) {
			if (err instanceof ApiError && err.status === 409) {
				syncStats.conflicts++;
				await serverWins<LocalPlant, ApiPlant>(
					db.plants,
					`/plants/${record.id}`,
					record.id,
					mapPlant
				);
			} else {
				syncStats.failures++;
				console.error(`[sync] plant ${record.id}:`, err);
			}
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/plants/${record.id}`, { method: 'DELETE' });
			await db.plants.delete(record.id);
		} catch (err) {
			syncStats.failures++;
			console.error(`[sync] delete plant ${record.id}:`, err);
		}
	}
}

// --- Care types ---

async function syncCareTypes(): Promise<void> {
	const pending = await db.careTypes
		.where('syncPending')
		.equals(1)
		.and((t) => t.isSystem === 0)
		.toArray();

	const toWrite = pending.filter((r) => r.syncDeleted === 0).sort(byCreatedAt);
	const toDelete = pending.filter((r) => r.syncDeleted === 1).sort(byCreatedAt);

	for (const record of toWrite) {
		try {
			if (record.everSynced === 0) {
				const body = await apiFetch<ApiCareType>('/care-types', {
					method: 'POST',
					body: JSON.stringify({ id: record.id, name: record.name, options: record.options })
				});
				await db.careTypes.update(record.id, {
					syncPending: 0,
					everSynced: 1,
					updatedAt: body.updatedAt
				});
			} else {
				const body = await apiFetch<ApiCareType>(`/care-types/${record.id}`, {
					method: 'PATCH',
					body: JSON.stringify({
						name: record.name,
						options: record.options,
						updatedAt: record.updatedAt
					})
				});
				await db.careTypes.update(record.id, { syncPending: 0, updatedAt: body.updatedAt });
			}
		} catch (err: unknown) {
			if (err instanceof ApiError && err.status === 409) {
				syncStats.conflicts++;
				await serverWins<LocalCareType, ApiCareType>(
					db.careTypes,
					`/care-types/${record.id}`,
					record.id,
					mapCareType
				);
			} else {
				syncStats.failures++;
				console.error(`[sync] care-type ${record.id}:`, err);
			}
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/care-types/${record.id}`, { method: 'DELETE' });
			await db.careTypes.delete(record.id);
		} catch (err) {
			syncStats.failures++;
			console.error(`[sync] delete care-type ${record.id}:`, err);
		}
	}
}

// --- Care schedules ---

async function syncCareSchedules(): Promise<void> {
	const pending = await db.careSchedules.where('syncPending').equals(1).toArray();
	const toWrite = pending.filter((r) => r.syncDeleted === 0).sort(byCreatedAt);
	const toDelete = pending.filter((r) => r.syncDeleted === 1).sort(byCreatedAt);

	for (const record of toWrite) {
		const base = `/plants/${record.plantId}/schedules`;
		try {
			if (record.everSynced === 0) {
				// nextDue excluded — API computes it from recurrence fields
				const body = await apiFetch<ApiCareSchedule>(base, {
					method: 'POST',
					body: JSON.stringify({
						id: record.id,
						careTypeId: record.careTypeId,
						selectedOption: record.selectedOption,
						notes: record.notes,
						dayOfWeek: record.dayOfWeek,
						dayOfMonth: record.dayOfMonth,
						months: record.months
					})
				});
				await db.careSchedules.update(record.id, {
					syncPending: 0,
					everSynced: 1,
					nextDue: body.nextDue,
					updatedAt: body.updatedAt
				});
			} else {
				const body = await apiFetch<ApiCareSchedule>(`${base}/${record.id}`, {
					method: 'PATCH',
					body: JSON.stringify({
						careTypeId: record.careTypeId,
						selectedOption: record.selectedOption,
						notes: record.notes,
						dayOfWeek: record.dayOfWeek,
						dayOfMonth: record.dayOfMonth,
						months: record.months,
						isActive: record.isActive,
						updatedAt: record.updatedAt
					})
				});
				await db.careSchedules.update(record.id, {
					syncPending: 0,
					nextDue: body.nextDue,
					updatedAt: body.updatedAt
				});
			}
		} catch (err: unknown) {
			if (err instanceof ApiError && err.status === 409) {
				syncStats.conflicts++;
				await serverWins<LocalCareSchedule, ApiCareSchedule>(
					db.careSchedules,
					`${base}/${record.id}`,
					record.id,
					mapCareSchedule
				);
			} else {
				syncStats.failures++;
				console.error(`[sync] schedule ${record.id}:`, err);
			}
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/plants/${record.plantId}/schedules/${record.id}`, { method: 'DELETE' });
			await db.careSchedules.delete(record.id);
		} catch (err) {
			syncStats.failures++;
			console.error(`[sync] delete schedule ${record.id}:`, err);
		}
	}
}

// --- Care logs ---

async function syncCareLogs(): Promise<void> {
	const pending = await db.careLogs.where('syncPending').equals(1).toArray();
	const toWrite = pending.filter((r) => r.syncDeleted === 0).sort(byCreatedAt);
	const toDelete = pending.filter((r) => r.syncDeleted === 1).sort(byCreatedAt);

	for (const record of toWrite) {
		const base = `/plants/${record.plantId}/logs`;
		try {
			if (record.everSynced === 0) {
				const body = await apiFetch<ApiCareLog>(base, {
					method: 'POST',
					body: JSON.stringify({
						id: record.id,
						careTypeId: record.careTypeId,
						scheduleId: record.scheduleId,
						selectedOption: record.selectedOption,
						notes: record.notes,
						performedAt: record.performedAt
					})
				});
				await db.careLogs.update(record.id, {
					syncPending: 0,
					everSynced: 1,
					updatedAt: body.createdAt
				});
			}
			// No PATCH path — logs are immutable once created
		} catch (err) {
			syncStats.failures++;
			console.error(`[sync] log ${record.id}:`, err);
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/plants/${record.plantId}/logs/${record.id}`, { method: 'DELETE' });
			await db.careLogs.delete(record.id);
		} catch (err) {
			syncStats.failures++;
			console.error(`[sync] delete log ${record.id}:`, err);
		}
	}
}

// --- Helpers ---

function byCreatedAt(a: { localCreatedAt: number }, b: { localCreatedAt: number }): number {
	return a.localCreatedAt - b.localCreatedAt;
}

async function serverWins<TLocal extends { id: string }, TApi>(
	table: Table<TLocal, string>,
	apiPath: string,
	id: string,
	mapper: (r: TApi) => Partial<TLocal>
): Promise<void> {
	try {
		const serverRecord = await apiFetch<TApi>(apiPath);
		await table.update(id, { ...mapper(serverRecord), syncPending: 0 } as Parameters<
			typeof table.update
		>[1]);
	} catch (fetchErr) {
		console.error(`[sync] server-wins fetch failed for ${id}:`, fetchErr);
	}
}

function mapPlant(r: ApiPlant): Partial<LocalPlant> {
	return {
		name: r.name,
		description: r.description,
		acquiredAt: r.acquiredAt,
		notes: r.notes,
		coverPhotoId: r.coverPhotoId,
		updatedAt: r.updatedAt,
		syncDeleted: 0,
		everSynced: 1
	};
}

function mapCareType(r: ApiCareType): Partial<LocalCareType> {
	return {
		name: r.name,
		options: r.options,
		updatedAt: r.updatedAt,
		syncDeleted: 0,
		everSynced: 1
	};
}

function mapCareSchedule(r: ApiCareSchedule): Partial<LocalCareSchedule> {
	return {
		careTypeId: r.careTypeId,
		selectedOption: r.selectedOption,
		notes: r.notes,
		dayOfWeek: r.dayOfWeek,
		dayOfMonth: r.dayOfMonth,
		months: r.months,
		nextDue: r.nextDue,
		isActive: r.isActive,
		updatedAt: r.updatedAt,
		syncDeleted: 0,
		everSynced: 1
	};
}
