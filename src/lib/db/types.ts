export interface SyncMeta {
	syncPending: 0 | 1; // 1 = has unpushed local changes (create or update)
	syncDeleted: 0 | 1; // 1 = pending DELETE on the API
	everSynced: 0 | 1; //  1 = record confirmed by the API at least once; drives POST vs PATCH in sync engine
	updatedAt: string; //   ISO 8601 — set on every local write; synced back from API response
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
	plantId: string; // FK → LocalPlant.id
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
	plantId: string; // FK → LocalPlant.id
	scheduleId: string | null; // FK → LocalCareSchedule.id; null for ad-hoc logs
	careTypeId: string;
	selectedOption: string | null;
	notes: string | null;
	performedAt: string; // ISO 8601 — when the care was performed
	// updatedAt is inherited from SyncMeta — uses createdAt as sentinel since logs are immutable
}
