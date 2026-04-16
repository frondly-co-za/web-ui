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
