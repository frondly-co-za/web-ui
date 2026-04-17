const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const MEANINGFUL_RAIN_MM = 2;

export interface WeatherData {
	today: {
		high: number;
		low: number;
		weatherCode: number;
		precipitationSum: number;
		sunrise: string;
		sunset: string;
	};
	current: {
		temperature: number;
		weatherCode: number;
		precipitation: number;
	};
	nextRain: {
		date: string;
		precipitationSum: number;
		weatherCode: number;
	} | null;
}

interface OpenMeteoResponse {
	timezone: string;
	hourly: {
		time: string[];
		temperature_2m: number[];
		precipitation: number[];
		weather_code: number[];
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		precipitation_sum: number[];
		sunrise: string[];
		sunset: string[];
	};
}

function findCurrentHourIndex(times: string[]): number {
	const now = new Date();
	const currentHour =
		now.getFullYear() +
		'-' +
		String(now.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(now.getDate()).padStart(2, '0') +
		'T' +
		String(now.getHours()).padStart(2, '0') +
		':00';
	const idx = times.findIndex((t) => t === currentHour);
	return idx >= 0 ? idx : 0;
}

function findNextRain(daily: OpenMeteoResponse['daily']): WeatherData['nextRain'] {
	for (let i = 1; i < daily.time.length; i++) {
		if (daily.precipitation_sum[i] >= MEANINGFUL_RAIN_MM) {
			return {
				date: daily.time[i],
				precipitationSum: daily.precipitation_sum[i],
				weatherCode: daily.weather_code[i]
			};
		}
	}
	return null;
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
	const params = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lng),
		hourly: 'temperature_2m,precipitation,weather_code',
		daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset',
		timezone: 'auto',
		forecast_days: '4'
	});

	const res = await fetch(`${BASE_URL}?${params}`);
	if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);

	const data: OpenMeteoResponse = await res.json();
	const hourIdx = findCurrentHourIndex(data.hourly.time);

	return {
		today: {
			high: Math.round(data.daily.temperature_2m_max[0]),
			low: Math.round(data.daily.temperature_2m_min[0]),
			weatherCode: data.daily.weather_code[0],
			precipitationSum: data.daily.precipitation_sum[0],
			sunrise: data.daily.sunrise[0],
			sunset: data.daily.sunset[0]
		},
		current: {
			temperature: Math.round(data.hourly.temperature_2m[hourIdx]),
			weatherCode: data.hourly.weather_code[hourIdx],
			precipitation: data.hourly.precipitation[hourIdx]
		},
		nextRain: findNextRain(data.daily)
	};
}
