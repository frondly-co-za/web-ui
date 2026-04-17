import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from '$lib/api/openMeteo';

const makeResponse = (overrides: object = {}) => ({
	timezone: 'Europe/London',
	hourly: {
		time: Array.from({ length: 168 }, (_, i) => {
			const d = new Date(2026, 3, 17, 0, 0, 0);
			d.setHours(i);
			return (
				d.getFullYear() +
				'-' +
				String(d.getMonth() + 1).padStart(2, '0') +
				'-' +
				String(d.getDate()).padStart(2, '0') +
				'T' +
				String(d.getHours()).padStart(2, '0') +
				':00'
			);
		}),
		temperature_2m: Array(168).fill(15),
		precipitation: Array(168).fill(0),
		weather_code: Array(168).fill(0)
	},
	daily: {
		time: [
			'2026-04-17',
			'2026-04-18',
			'2026-04-19',
			'2026-04-20',
			'2026-04-21',
			'2026-04-22',
			'2026-04-23'
		],
		weather_code: [0, 0, 61, 0, 0, 0, 0],
		temperature_2m_max: [20, 21, 18, 19, 22, 23, 20],
		temperature_2m_min: [10, 11, 9, 10, 12, 13, 11],
		precipitation_sum: [0, 0, 5, 0, 0, 0, 0],
		sunrise: [
			'2026-04-17T05:30',
			'2026-04-18T05:28',
			'2026-04-19T05:26',
			'2026-04-20T05:24',
			'2026-04-21T05:22',
			'2026-04-22T05:20',
			'2026-04-23T05:18'
		],
		sunset: [
			'2026-04-17T20:00',
			'2026-04-18T20:02',
			'2026-04-19T20:04',
			'2026-04-20T20:06',
			'2026-04-21T20:08',
			'2026-04-22T20:10',
			'2026-04-23T20:12'
		]
	},
	...overrides
});

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('fetchWeather', () => {
	it('returns today high/low rounded', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => makeResponse()
			})
		);
		const result = await fetchWeather(51.5, -0.1);
		expect(result.today.high).toBe(20);
		expect(result.today.low).toBe(10);
	});

	it('throws on non-2xx response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
		await expect(fetchWeather(51.5, -0.1)).rejects.toThrow('Open-Meteo error: 429');
	});

	it('finds next rain skipping today', async () => {
		const data = makeResponse();
		// day 0 has 3mm (today) — should be skipped; day 2 has 5mm — should be found
		data.daily.precipitation_sum[0] = 3;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
		const result = await fetchWeather(51.5, -0.1);
		expect(result.nextRain?.date).toBe('2026-04-19');
		expect(result.nextRain?.precipitationSum).toBe(5);
	});

	it('returns null nextRain when no day meets threshold', async () => {
		const data = makeResponse();
		data.daily.precipitation_sum = [0, 0, 1, 1.9, 0, 0, 0];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
		const result = await fetchWeather(51.5, -0.1);
		expect(result.nextRain).toBeNull();
	});

	it('returns null nextRain when rain only on today', async () => {
		const data = makeResponse();
		data.daily.precipitation_sum = [10, 0, 0, 0, 0, 0, 0];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
		const result = await fetchWeather(51.5, -0.1);
		expect(result.nextRain).toBeNull();
	});

	it('picks rain on the first qualifying future day', async () => {
		const data = makeResponse();
		data.daily.precipitation_sum = [0, 3, 8, 0, 0, 0, 0];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
		const result = await fetchWeather(51.5, -0.1);
		expect(result.nextRain?.date).toBe('2026-04-18');
		expect(result.nextRain?.precipitationSum).toBe(3);
	});

	it('includes sunrise and sunset in today', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => makeResponse() })
		);
		const result = await fetchWeather(51.5, -0.1);
		expect(result.today.sunrise).toBe('2026-04-17T05:30');
		expect(result.today.sunset).toBe('2026-04-17T20:00');
	});
});
