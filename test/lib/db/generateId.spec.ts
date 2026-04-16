import { describe, it, expect } from 'vitest';
import { generateId } from '$lib/db/generateId';

describe('generateId', () => {
	it('returns a 24-character hex string', () => {
		const id = generateId();
		expect(id).toMatch(/^[0-9a-f]{24}$/);
	});

	it('generates unique IDs', () => {
		const ids = Array.from({ length: 100 }, generateId);
		expect(new Set(ids).size).toBe(100);
	});
});
