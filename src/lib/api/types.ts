export interface ApiCareSchedule {
	id: string;
	userId: string;
	plantId: string;
	careTypeId: string;
	selectedOption: string | null;
	notes: string | null;
	dayOfWeek: number[];
	dayOfMonth: number[];
	months: number[];
	nextDue: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface ApiCareLog {
	id: string;
	userId: string;
	plantId: string;
	scheduleId: string | null;
	careTypeId: string;
	selectedOption: string | null;
	notes: string | null;
	performedAt: string;
	createdAt: string;
}

export interface ApiPlant {
	id: string;
	userId: string;
	name: string;
	description: string | null;
	coverPhotoId: string | null;
	acquiredAt: string | null;
	notes: string | null;
	schedules?: ApiCareSchedule[];
	recentLogs?: ApiCareLog[];
	createdAt: string;
	updatedAt: string;
}

export interface ApiCareType {
	id: string;
	userId: string | null; // null = system default
	name: string;
	options: string[];
	createdAt: string;
	updatedAt: string;
}
