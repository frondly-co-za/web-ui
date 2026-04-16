import ObjectId from 'bson-objectid';

export function generateId(): string {
	return new ObjectId().toHexString();
}
