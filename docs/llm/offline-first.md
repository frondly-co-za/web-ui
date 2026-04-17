# Frondly PWA — Offline-First Low-Level Design (v3)

## Overview

This document describes the low-level design for offline-first data management in the Frondly SvelteKit PWA. The approach uses Dexie.js as a local IndexedDB store, a sync engine that pushes pending changes to the Frondly API when connectivity is restored, and a Svelte 5 rune-based connectivity store for reactive online/offline awareness.

The backend API is the source of truth. The local Dexie store is a write-ahead cache. This is not a two-way sync system — the PWA does not pull remote changes initiated by other clients (deferred to a future version).

---

## Constraints & Decisions

- **Client-generated IDs:** All records are assigned a client-generated ObjectId hex string before being written to Dexie. Use the `bson-objectid` npm package (`new ObjectId().toHexString()`). The API accepts an optional `id` field on POST; other API consumers omit it and MongoDB generates one natively. All `_id` values in MongoDB remain native `ObjectId` type regardless of origin.
- **API treated as a black box:** The PWA uses the existing POST (create) and PATCH (update) endpoints. No new PUT/upsert endpoint is added to the API. The sync engine distinguishes creates from updates locally using an `everSynced` flag.
- **Sync flags are flat, not nested:** Dexie indexes do not work on nested object properties. Use flat `number` fields (`0 | 1`) rather than a nested sync status object.
- **Dexie indexes do not support `boolean`:** Use `0` and `1` as substitutes throughout.
- **Tombstones:** Deleted records must not be removed from Dexie until the API confirms the delete. A `syncDeleted: 1` flag marks them as pending deletion.
- **Online-only reads:** The UI always reads from Dexie. Direct API reads are not used in components. Dexie is populated from the API after auth (hydration) and kept current via the sync engine.
- **Conflict strategy — server wins:** `updatedAt` (ISO 8601 string) is included on every PATCH. The API rejects a PATCH if the server copy is newer (optimistic concurrency). On a 409 response, the sync engine fetches the current server version, overwrites the local record, and clears `syncPending`. Single-user app; conflicts are rare but possible across devices.
- **Sync before hydrate:** On reconnect, the sync engine always runs before hydration. Hydration skips any record still `syncPending: 1` after sync to avoid overwriting unconfirmed local changes with a potentially older server copy.
- **POST/PATCH responses return the entity:** The API always returns the full entity body on 201 (create) and 200 (update). The sync engine reads `updatedAt` from this response and writes it back to Dexie. This prevents false 409s on subsequent writes where the local `updatedAt` might differ from the server's due to clock skew or server-side recomputation.
- **Enriched plant response via `?include=`:** `GET /plants` accepts an optional `?include=schedules,recentLogs` query parameter. Without it, the response is a flat `Plant[]`. With it, each plant carries its care schedules and latest 5 care logs as embedded arrays. This is the hydration call — a single bounded request for all high-value data. POST and PATCH on plants always return the flat `Plant` shape regardless of include.
- **`undefined` vs `[]` as an include discriminator:** `plant.schedules === undefined` means includes were not requested. `plant.schedules` being an empty array means includes were requested and the plant genuinely has no schedules. This maps directly to MongoDB `$lookup` behaviour, which always returns `[]` for joins with no matches.
- **Deliberate "See All" for log history:** Hydration only loads the 5 most recent logs per plant. The full log history for a specific plant is fetched on demand via `GET /plants/:plantId/logs` when the user explicitly navigates to it.
- **Connectivity probe uses HEAD:** The `online` browser event triggers a `HEAD /health` probe against the API before marking the app as connected. `navigator.onLine` only reflects whether a network interface is up, not whether real connectivity exists. `HEAD` is the correct method — it executes the full server pipeline but returns no body. `OPTIONS` is a CORS preflight mechanism and is not appropriate here.
- **Photos are online-only (v1):** Binary photo uploads require blob storage in Dexie and a multipart sync flow. This is deferred. The local plant record stores `coverPhotoId` once it has been set online via a normal upload.

---

## Packages

```bash
npm install dexie bson-objectid
```

---

## 1. Local Data Shape

All Dexie table types extend a base sync metadata interface. These types live in `src/lib/db/types.ts`.

Dates are stored as ISO 8601 strings to match the API exactly, avoiding conversion errors. `localCreatedAt` is the only `number` field — it is purely local, used for sync ordering, and never sent to the API.

```typescript
// src/lib/db/types.ts

export interface SyncMeta {
	syncPending: 0 | 1; // 1 = has unpushed local changes (create or update)
	syncDeleted: 0 | 1; // 1 = pending DELETE on the API
	everSynced: 0 | 1; // 1 = record confirmed by the API at least once
	//     drives POST vs PATCH in sync engine
	updatedAt: string; // ISO 8601 — set on every local write; synced back from API response
	localCreatedAt: number; // Unix ms — used to order sync operations; never sent to API
}

export interface LocalPlant extends SyncMeta {
	id: string; // ObjectId hex — primary key in Dexie, _id in MongoDB
	name: string;
	description: string | null;
	acquiredAt: string | null; // ISO 8601 date
	notes: string | null;
	coverPhotoId: string | null; // set by the API after photo upload; not synced by the engine
}

export interface LocalCareType extends SyncMeta {
	id: string;
	name: string;
	options: string[];
	isSystem: 0 | 1; // 1 = provided by the system (userId: null on API); never written back
}

export interface LocalCareSchedule extends SyncMeta {
	id: string;
	plantId: string; // FK → LocalPlant.id; used to build nested route URLs
	careTypeId: string; // FK → LocalCareType.id
	selectedOption: string | null;
	notes: string | null;
	dayOfWeek: number[]; // 0–6; empty = any
	dayOfMonth: number[]; // 1–31; empty = any
	months: number[]; // 1–12; empty = any
	nextDue: string; // ISO 8601 — computed server-side on POST; locally approximated until synced
	isActive: boolean;
}

export interface LocalCareLog extends SyncMeta {
	id: string;
	plantId: string; // FK → LocalPlant.id; used to build nested route URLs
	scheduleId: string | null; // FK → LocalCareSchedule.id; null for ad-hoc logs
	careTypeId: string;
	selectedOption: string | null;
	notes: string | null;
	performedAt: string; // ISO 8601 — when the care was performed
	// CareLog has no updatedAt — the API does not support updating logs; only create and delete
}
```

> `userId` is not stored locally — it is always sourced from the JWT on the API side and is not needed for local queries.

---

## 2. Dexie Database Definition

```typescript
// src/lib/db/index.ts

import Dexie, { type Table } from 'dexie';
import type { LocalPlant, LocalCareType, LocalCareSchedule, LocalCareLog } from './types';

class FrondlyDb extends Dexie {
	plants!: Table<LocalPlant, string>;
	careTypes!: Table<LocalCareType, string>;
	careSchedules!: Table<LocalCareSchedule, string>;
	careLogs!: Table<LocalCareLog, string>;

	constructor() {
		super('frondly');
		this.version(1).stores({
			// Only indexed fields listed — non-indexed fields are stored but not queryable
			plants: 'id, syncPending, syncDeleted, everSynced',
			careTypes: 'id, syncPending, syncDeleted, everSynced, isSystem',
			careSchedules: 'id, plantId, careTypeId, syncPending, syncDeleted, everSynced, nextDue',
			careLogs: 'id, plantId, scheduleId, syncPending, syncDeleted, everSynced, performedAt'
		});
	}
}

export const db = new FrondlyDb();
```

> `id` is the Dexie primary key (first field in the schema string). It maps directly to MongoDB's `_id` as a hex string.

---

## 3. ID Generation

```typescript
// src/lib/db/generateId.ts

import ObjectId from 'bson-objectid';

export function generateId(): string {
	return new ObjectId().toHexString();
}
```

---

## 4. Connectivity Store

Uses a two-tier approach: `offline` events are trusted immediately; `online` events trigger an API probe before marking the app as online.

The probe issues a `HEAD /health` request. Fastify automatically handles `HEAD` on any registered `GET` route — no separate registration is needed in the API.

```typescript
// src/lib/stores/connectivity.svelte.ts

function createConnectivityStore() {
	let online = $state(navigator.onLine);
	let verifying = $state(false);

	async function probe(): Promise<boolean> {
		try {
			const res = await fetch('/api/health', {
				method: 'HEAD',
				cache: 'no-store',
				signal: AbortSignal.timeout(5000)
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async function handleOnline() {
		verifying = true;
		online = await probe();
		verifying = false;
	}

	function handleOffline() {
		online = false; // trusted immediately — no probe needed
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
	}

	return {
		get online() {
			return online;
		},
		get verifying() {
			return verifying;
		}
	};
}

export const connectivity = createConnectivityStore();
```

---

## 5. Data Access Layer (Client)

Route handlers and Svelte components never call Dexie directly. All reads and writes go through a per-entity client module.

```typescript
// src/lib/clients/plantClient.ts

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
			// everSynced is not touched — retains its existing value
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
```

> Apply the same pattern for `careTypeClient`, `careScheduleClient`, and `careLogClient`. `CareLog` has no `update()` — the API only supports create and delete for logs.

---

## 6. Initial Data Load (Hydration)

On first load (or after auth), fetch all records from the API and populate Dexie. Always run **after** `runSync()` so pending local changes are pushed first.

### Strategy

A single call to `GET /plants?include=schedules,recentLogs` returns all plants with their care schedules and latest 5 care logs embedded. Care types are fetched in parallel via `GET /care-types`. This gives the PWA all the data it needs to render the main UI and plant detail views without any further requests.

The full log history for a given plant is only fetched when the user explicitly requests it ("See All" action), via `GET /plants/:plantId/logs`. Until then, the most recent 5 logs per plant are sufficient for the care timeline view.

### Hydration populates three Dexie tables from one enriched response

The embedded `schedules` and `recentLogs` arrays are unpacked from each plant and inserted into `db.careSchedules` and `db.careLogs` respectively. The plant records themselves are stored flat in `db.plants` (without the embedded arrays).

```typescript
// src/lib/sync/hydrate.ts

import { db } from '$lib/db';
import { apiFetch } from '$lib/api/apiFetch';
import type { LocalPlant, LocalCareType, LocalCareSchedule, LocalCareLog } from '$lib/db/types';

export async function hydrateFromApi(): Promise<void> {
	// Single enriched plants call + care types in parallel
	const [enrichedPlants, careTypes] = await Promise.all([
		apiFetch<any[]>('/plants?include=schedules,recentLogs'),
		apiFetch<any[]>('/care-types')
	]);

	await db.transaction('rw', db.plants, db.careTypes, db.careSchedules, db.careLogs, async () => {
		// Collect IDs of records still pending — do not overwrite these
		const pendingSet = async (table: Dexie.Table<any, string>) =>
			new Set((await table.where('syncPending').equals(1).toArray()).map((r: any) => r.id));

		const pendingPlantIds = await pendingSet(db.plants);
		const pendingTypeIds = await pendingSet(db.careTypes);
		const pendingScheduleIds = await pendingSet(db.careSchedules);
		const pendingLogIds = await pendingSet(db.careLogs);

		const syncMeta = { syncPending: 0 as const, syncDeleted: 0 as const, everSynced: 1 as const };

		// Unpack plants, schedules, and logs from the enriched response
		const plants: any[] = [];
		const schedules: any[] = [];
		const logs: any[] = [];

		for (const p of enrichedPlants) {
			plants.push(p);
			if (p.schedules) schedules.push(...p.schedules);
			if (p.recentLogs) logs.push(...p.recentLogs);
		}

		const serverPlantIds = new Set(plants.map((p) => p.id));
		const serverTypeIds = new Set(careTypes.map((t) => t.id));
		const serverScheduleIds = new Set(schedules.map((s) => s.id));
		const serverLogIds = new Set(logs.map((l) => l.id));

		// Remove synced local records absent from the server response (deleted from another device)
		// Never touch pending records
		await db.plants.filter((p) => p.syncPending === 0 && !serverPlantIds.has(p.id)).delete();
		await db.careTypes.filter((t) => t.syncPending === 0 && !serverTypeIds.has(t.id)).delete();
		await db.careSchedules
			.filter((s) => s.syncPending === 0 && !serverScheduleIds.has(s.id))
			.delete();
		// Only clean up logs that belong to plants we received — if a plant had no recentLogs
		// included, we can't know which logs are stale without fetching the full set
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
```

### "See All" eager log hydration

Triggered by an explicit user action on a plant's log history view. Fetches the complete log set for one plant and upserts into Dexie, preserving any pending local logs.

```typescript
// src/lib/sync/hydrate.ts (continued)

export async function hydrateLogsForPlant(plantId: string): Promise<void> {
	const logs = await apiFetch<any[]>(`/plants/${plantId}/logs`);

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
```

---

## 7. Sync Engine

Processes all locally pending records and pushes them to the API. The `everSynced` flag determines the HTTP method: `everSynced: 0` → `POST` (create); `everSynced: 1` → `PATCH` (update).

### Sync ordering

The sync engine processes entities in dependency order to avoid foreign key violations:

1. **Plants** — no dependencies
2. **Care types** — no dependencies (runs in parallel with plants)
3. **Care schedules** — depend on plants and care types
4. **Care logs** — depend on plants, care types, and schedules

Within each entity, writes (non-deleted) are sorted by `localCreatedAt` and processed before deletes.

### After a successful POST/PATCH

The API returns the full entity body. The sync engine reads `updatedAt` back from the response and writes it to the local record. For schedules, `nextDue` is also written back — it is computed server-side and must replace the client's approximation.

### 409 Conflict handling (server wins)

When a PATCH returns 409, the sync engine fetches the current server version, overwrites the local record, and clears `syncPending`.

### API schemas use `additionalProperties: false`

Payloads must be built per entity — only the fields the API schema accepts. There is no generic payload function.

```typescript
// src/lib/sync/syncEngine.ts

import { db } from '$lib/db';
import { apiFetch } from '$lib/api/apiFetch';

let syncing = false;

export async function runSync(): Promise<void> {
	if (syncing) return;
	syncing = true;
	try {
		await Promise.all([syncPlants(), syncCareTypes()]);
		await syncCareSchedules();
		await syncCareLogs();
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
				const body = await apiFetch<any>('/plants', {
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
				const body = await apiFetch<any>(`/plants/${record.id}`, {
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
		} catch (err: any) {
			if (err?.status === 409) {
				await serverWins(db.plants, `/plants/${record.id}`, record.id, mapPlant);
			} else {
				console.error(`[sync] plant ${record.id}:`, err);
			}
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/plants/${record.id}`, { method: 'DELETE' });
			await db.plants.delete(record.id);
		} catch (err) {
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
				const body = await apiFetch<any>('/care-types', {
					method: 'POST',
					body: JSON.stringify({ id: record.id, name: record.name, options: record.options })
				});
				await db.careTypes.update(record.id, {
					syncPending: 0,
					everSynced: 1,
					updatedAt: body.updatedAt
				});
			} else {
				const body = await apiFetch<any>(`/care-types/${record.id}`, {
					method: 'PATCH',
					body: JSON.stringify({
						name: record.name,
						options: record.options,
						updatedAt: record.updatedAt
					})
				});
				await db.careTypes.update(record.id, { syncPending: 0, updatedAt: body.updatedAt });
			}
		} catch (err: any) {
			if (err?.status === 409) {
				await serverWins(db.careTypes, `/care-types/${record.id}`, record.id, mapCareType);
			} else {
				console.error(`[sync] care-type ${record.id}:`, err);
			}
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/care-types/${record.id}`, { method: 'DELETE' });
			await db.careTypes.delete(record.id);
		} catch (err) {
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
				// nextDue is NOT sent — the API service computes it from the recurrence fields
				const body = await apiFetch<any>(base, {
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
				// Write back server-computed nextDue alongside updatedAt
				await db.careSchedules.update(record.id, {
					syncPending: 0,
					everSynced: 1,
					nextDue: body.nextDue,
					updatedAt: body.updatedAt
				});
			} else {
				const body = await apiFetch<any>(`${base}/${record.id}`, {
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
		} catch (err: any) {
			if (err?.status === 409) {
				await serverWins(db.careSchedules, `${base}/${record.id}`, record.id, mapCareSchedule);
			} else {
				console.error(`[sync] schedule ${record.id}:`, err);
			}
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/plants/${record.plantId}/schedules/${record.id}`, { method: 'DELETE' });
			await db.careSchedules.delete(record.id);
		} catch (err) {
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
				const body = await apiFetch<any>(base, {
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
			} else {
				// No updatedAt optimistic lock — CareLog has no updatedAt field
				const body = await apiFetch<any>(`${base}/${record.id}`, {
					method: 'PATCH',
					body: JSON.stringify({
						careTypeId: record.careTypeId,
						scheduleId: record.scheduleId,
						selectedOption: record.selectedOption,
						notes: record.notes,
						performedAt: record.performedAt
					})
				});
				await db.careLogs.update(record.id, { syncPending: 0, updatedAt: body.createdAt });
			}
		} catch (err) {
			console.error(`[sync] log ${record.id}:`, err);
		}
	}

	for (const record of toDelete) {
		try {
			await apiFetch(`/plants/${record.plantId}/logs/${record.id}`, { method: 'DELETE' });
			await db.careLogs.delete(record.id);
		} catch (err) {
			console.error(`[sync] delete log ${record.id}:`, err);
		}
	}
}

// --- Helpers ---

function byCreatedAt(a: { localCreatedAt: number }, b: { localCreatedAt: number }): number {
	return a.localCreatedAt - b.localCreatedAt;
}

async function serverWins<T extends { id: string }>(
	table: Dexie.Table<T, string>,
	apiPath: string,
	id: string,
	mapper: (r: any) => Partial<T>
): Promise<void> {
	try {
		const serverRecord = await apiFetch<any>(apiPath);
		await table.update(id, { ...mapper(serverRecord), syncPending: 0 as const });
	} catch (fetchErr) {
		console.error(`[sync] server-wins fetch failed for ${id}:`, fetchErr);
	}
}

function mapPlant(r: any) {
	return {
		name: r.name,
		description: r.description,
		acquiredAt: r.acquiredAt,
		notes: r.notes,
		coverPhotoId: r.coverPhotoId,
		updatedAt: r.updatedAt,
		syncDeleted: 0 as const,
		everSynced: 1 as const
	};
}

function mapCareType(r: any) {
	return {
		name: r.name,
		options: r.options,
		updatedAt: r.updatedAt,
		syncDeleted: 0 as const,
		everSynced: 1 as const
	};
}

function mapCareSchedule(r: any) {
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
		syncDeleted: 0 as const,
		everSynced: 1 as const
	};
}
```

---

## 8. Sync Trigger

Wire the sync engine to the connectivity store. On reconnect, **sync runs first, then hydration**.

```typescript
// src/lib/sync/syncTrigger.ts

import { connectivity } from '$lib/stores/connectivity.svelte';
import { runSync } from './syncEngine';
import { hydrateFromApi } from './hydrate';

export function initSyncTrigger() {
	let previousOnline = connectivity.online;

	$effect(() => {
		const isOnline = connectivity.online;
		if (isOnline && !previousOnline) {
			runSync().then(() => hydrateFromApi());
		}
		previousOnline = isOnline;
	});
}
```

> Call `initSyncTrigger()` from the root `+layout.svelte` once the Auth0 session is resolved.

---

## 9. API Changes (Fastify Backend)

### 9.1 Health endpoint (no auth required)

Register as its own plugin (`src/infrastructure/http/routes/health.ts`) for consistency with all other route files.

```typescript
fastify.get('/health', { config: { skipAuth: true } }, async (_req, reply) => {
	reply.code(200).send({ status: 'ok' });
});
```

Fastify automatically handles `HEAD` on any `GET` route — no separate `HEAD` handler needed.

### 9.2 `GET /plants` — optional `?include=` query parameter

The query parameter accepts a comma-separated list of include keys. Unknown values return a `400`. Currently supported values: `schedules`, `recentLogs`.

When `include` is absent, the response is a flat `Plant[]` — no change from current behaviour.

When `include=schedules,recentLogs` is present, the plants repository runs an aggregation pipeline and each plant carries:

- `schedules: CareSchedule[]` — all active and inactive schedules for the plant
- `recentLogs: CareLog[]` — the 5 most recent logs ordered by `performedAt` desc

### 9.3 `Plant` domain type — optional embedded fields

```typescript
export interface Plant {
	id: string;
	userId: string;
	name: string;
	description: string | null;
	coverPhotoId: string | null;
	acquiredAt: string | null;
	notes: string | null;
	schedules?: CareSchedule[]; // undefined = not requested; [] = requested, none exist
	recentLogs?: CareLog[]; // undefined = not requested; [] = requested, none exist
	createdAt: string;
	updatedAt: string;
}
```

`undefined` and `[]` are semantically distinct: `undefined` means the client did not request includes; `[]` means it did and the plant genuinely has no data. This maps directly to MongoDB `$lookup` behaviour, which returns `[]` for joins with no matches — no special handling required.

POST and PATCH on plants always return the flat `Plant` shape (without embedded arrays) regardless of whether `?include=` was used on the GET.

### 9.4 Plants repository — aggregation pipeline for includes

`findAll(userId, include?)` and `findById(userId, id, include?)` gain an optional `include` parameter. When includes are requested, the repository runs an aggregation pipeline:

```typescript
// Schedules — standard lookup (all schedules for the plant)
{
    $lookup: {
        from: 'careSchedules',
        localField: '_id',
        foreignField: 'plantId',
        as: 'schedules'
    }
}

// Recent logs — pipeline lookup (sorted, limited to 5)
{
    $lookup: {
        from: 'careLogs',
        let: { plantId: '$_id' },
        pipeline: [
            { $match: { $expr: { $eq: ['$plantId', '$$plantId'] } } },
            { $sort: { performedAt: -1 } },
            { $limit: 5 }
        ],
        as: 'recentLogs'
    }
}
```

When includes are not requested, the existing `find` + `toPlant` path is unchanged.

### 9.5 Accept optional client-supplied `id` on POST

Add `id: Type.Optional(Type.String(OID))` to the TypeBox body schema for all JSON POST create endpoints (`POST /plants`, `POST /plants/:plantId/logs`, `POST /plants/:plantId/schedules`, `POST /care-types`).

The repository uses the provided ID if present, otherwise generates one: `const _id = data.id ? new ObjectId(data.id) : new ObjectId()`.

A duplicate ID (race condition or client retry) returns **409 Conflict** via a shared `setErrorHandler` in `server.ts` that maps MongoDB error code 11000.

### 9.6 Optimistic concurrency via `updatedAt` on PATCH

Add `updatedAt: Type.Optional(Type.String({ format: 'date-time' }))` to the TypeBox body schema for all PATCH endpoints on entities that have `updatedAt` (`Plant`, `CareSchedule`, `CareType`).

The repository `update()` method adds `updatedAt` to the MongoDB filter when provided:

```typescript
{
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
    ...(data.updatedAt ? { updatedAt: { $lte: new Date(data.updatedAt) } } : {})
}
```

When `findOneAndUpdate` returns `null` and the request included `updatedAt`, the route handler calls `findById` to distinguish:

- Record found → **409 Conflict** (server was updated more recently)
- Record not found → **404 Not Found**

`CareLog` has no `updatedAt` — no optimistic concurrency applies to logs.

### 9.7 POST and PATCH response bodies

All POST (create) and PATCH (update) endpoints already return the full entity body. No change required. The sync engine depends on this to read back `updatedAt` (and `nextDue` for schedules) after each write.

---

## 10. File Structure Summary

```
src/lib/
├── db/
│   ├── index.ts                    # Dexie instance and schema
│   ├── types.ts                    # LocalPlant, LocalCareType, LocalCareSchedule, LocalCareLog, SyncMeta
│   └── generateId.ts               # bson-objectid wrapper
├── clients/
│   ├── plantClient.ts              # CRUD over Dexie for plants
│   ├── careTypeClient.ts
│   ├── careScheduleClient.ts
│   └── careLogClient.ts            # No update() — API only supports create and delete for logs
├── stores/
│   └── connectivity.svelte.ts      # Svelte 5 rune-based online/offline store
├── sync/
│   ├── hydrate.ts                  # hydrateFromApi() + hydrateLogsForPlant()
│   ├── syncEngine.ts               # Push pending Dexie records to API
│   └── syncTrigger.ts              # $effect wiring: sync → hydrate on reconnect
└── api/
    └── apiFetch.ts                 # Thin fetch wrapper (auth headers, base URL, error parsing)
```

---

## 11. Gotcha Reference

| Gotcha                                                                                     | Resolution                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigator.onLine` is unreliable as a "connected" signal                                   | Probe `HEAD /health` on `online` events before setting `connectivity.online = true`                                                                                                             |
| `OPTIONS` is not a connectivity probe — it is a CORS preflight mechanism                   | Use `HEAD` — semantically correct, same low overhead, works on same-origin requests                                                                                                             |
| Dexie cannot index nested objects or `boolean` fields                                      | Flat `0 \| 1` number fields: `syncPending`, `syncDeleted`, `everSynced`, `isSystem`                                                                                                             |
| Hard-deleting records locally loses the pending API delete                                 | Keep tombstones (`syncDeleted: 1`); only `table.delete()` after API confirms                                                                                                                    |
| MongoDB generates `_id` — not available offline                                            | Client generates ObjectId hex string via `bson-objectid`; API accepts optional `id` on POST                                                                                                     |
| Other API clients must not be impacted by offline ID generation                            | `id` in POST body is optional; omitting it causes MongoDB to generate natively; all IDs remain native `ObjectId` type in MongoDB regardless                                                     |
| Sync engine needs to distinguish create vs update without a PUT/upsert endpoint            | `everSynced` flag: `0` → `POST`, `1` → `PATCH`; set to `1` after first confirmed POST response                                                                                                  |
| Hydration overwriting pending local changes                                                | Always run `runSync()` before `hydrateFromApi()`; hydration skips records where `syncPending === 1`                                                                                             |
| Hydration not reflecting server-side deletes from another device                           | Delete local synced records whose `id` is absent from the server response, but only where `syncPending === 0`                                                                                   |
| Stale logs not cleaned up for plants where only recent logs were fetched                   | Only delete local logs for a plant if `serverPlantIds` contains that plant — avoids falsely removing unhydrated logs                                                                            |
| Multiple sync runs firing concurrently                                                     | `syncing` boolean mutex in `syncEngine.ts` — early return if already running                                                                                                                    |
| Batch-marking records as synced after a partial failure                                    | Clear `syncPending` per record individually, only on confirmed API success                                                                                                                      |
| DELETE arriving at server before the record's CREATE                                       | Sort sync queue: writes before deletes, each group ordered by `localCreatedAt`                                                                                                                  |
| Stale writes overwriting newer server data across devices                                  | `updatedAt` (ISO 8601) on every PATCH; API rejects if server copy is newer (409)                                                                                                                |
| False 409 on the write after a successful POST due to clock skew                           | Read `updatedAt` from the POST/PATCH response body and write it back to Dexie; never treat the locally-set `updatedAt` as authoritative after sync                                              |
| Generic payload builder sending unknown fields — rejected by `additionalProperties: false` | Entity-specific payload builders; no generic function; each sends only the fields in that entity's API schema                                                                                   |
| `syncTable('/care-logs', db.careLogs)` — care logs and schedules use nested routes         | Entity-specific sync functions; use `record.plantId` to build `/plants/:plantId/logs/:id` URLs                                                                                                  |
| `nextDue` sent in schedule POST body — API rejects it (`additionalProperties: false`)      | Exclude `nextDue` from POST payload; computed server-side; write back from the POST response                                                                                                    |
| Sync ordering: care log with `scheduleId` references a schedule not yet on the server      | Process sync in dependency order: plants + care types → schedules → logs                                                                                                                        |
| 409 on PATCH — local changes conflict with a newer server version                          | Server wins: fetch the current server version, overwrite local record, clear `syncPending`                                                                                                      |
| Storing ISO 8601 `updatedAt` from the API into a local `number` field                      | Store `updatedAt` as `string` (ISO 8601) in Dexie throughout; only `localCreatedAt` is `number`                                                                                                 |
| System care types (userId: null on API) being written back during sync                     | `isSystem: 1` flag in Dexie; sync engine skips records where `isSystem === 1`                                                                                                                   |
| `plant.schedules` being `undefined` vs `[]` — ambiguous without a convention               | `undefined` = includes not requested; `[]` = requested and genuinely empty; enforced by always initialising arrays in the aggregation (MongoDB `$lookup` returns `[]` for no matches naturally) |
| `?include=` with an unknown value silently ignored                                         | Validate include values against an enum allowlist in the TypeBox query schema; return 400 for unknown values                                                                                    |
