# Dashboard — Implementation Guide

This document covers the full dashboard page (`/dashboard`) and its three sections. Read the ADR at `docs/adr/001-weather-widget.md` before working on the weather widget.

---

## Page layout

**Route:** `src/routes/dashboard/+page.svelte`  
**Load file:** `src/routes/dashboard/+page.ts` — export `ssr = false`, `prerender = false` (auth-dependent page)

Three vertically stacked sections, responsive (single column on mobile, wider layout on desktop):

1. **WeatherWidget** — top
2. **UpcomingCare** — middle
3. **MyPlants** — bottom

---

## Section 1: Weather Widget

### Files

- `src/lib/components/weather/WeatherWidget.svelte` — main widget
- `src/lib/components/weather/WeatherIcon.svelte` — WMO code → icon mapping
- `src/lib/api/openMeteo.ts` — Open-Meteo fetch logic and type definitions

### State machine

The widget has four display states, driven by a single `$state`:

```ts
type WeatherState =
	| { status: 'loading' }
	| { status: 'offline' }
	| { status: 'no-location' } // geolocation denied or unavailable
	| { status: 'error'; message: string }
	| { status: 'ready'; data: WeatherData };
```

### Location resolution

On mount:

1. Check `localStorage.getItem('frondly:weather:coords')`. If present and valid JSON `{ lat, lng, cachedAt }`, use it (no expiry — coords are stable).
2. Otherwise call `navigator.geolocation.getCurrentPosition()`. On success, write to `localStorage` and proceed. On failure/denial, transition to `no-location` state.

```ts
interface CachedCoords {
	lat: number;
	lng: number;
	cachedAt: number; // Date.now()
}
```

### Open-Meteo API call

**File:** `src/lib/api/openMeteo.ts`

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lng}
  &hourly=temperature_2m,precipitation,weather_code
  &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset
  &timezone=auto
  &forecast_days=7
```

`timezone=auto` makes Open-Meteo return timestamps in the timezone of the requested coordinates — no client-side timezone conversion needed.

Response shape (relevant fields):

```ts
interface OpenMeteoResponse {
	timezone: string;
	hourly: {
		time: string[]; // ISO datetime strings, one per hour
		temperature_2m: number[];
		precipitation: number[];
		weather_code: number[];
	};
	daily: {
		time: string[]; // ISO date strings (YYYY-MM-DD)
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		precipitation_sum: number[];
		sunrise: string[];
		sunset: string[];
	};
}
```

Export a single async function from `openMeteo.ts`:

```ts
export async function fetchWeather(lat: number, lng: number): Promise<WeatherData>;
```

It should call fetch, parse the JSON, and transform it into the `WeatherData` shape (see below). Throw on non-2xx.

### Derived `WeatherData` shape

```ts
interface WeatherData {
	today: {
		high: number; // daily.temperature_2m_max[0]
		low: number; // daily.temperature_2m_min[0]
		weatherCode: number; // daily.weather_code[0]
		precipitationSum: number; // daily.precipitation_sum[0] in mm
		sunrise: string; // daily.sunrise[0]
		sunset: string; // daily.sunset[0]
	};
	current: {
		temperature: number; // hourly value at current hour index
		weatherCode: number;
		precipitation: number; // mm in this hour
	};
	nextRain: NextRain | null;
}

interface NextRain {
	date: string; // YYYY-MM-DD from daily.time
	precipitationSum: number;
	weatherCode: number;
}
```

**Current hour index:** Find the index in `hourly.time` where the ISO datetime string's date+hour matches the current local hour. Since `timezone=auto` aligns the timestamps to local time, you can match by `new Date(hourly.time[i]).getHours() === new Date().getHours()` and same date.

**Next rain algorithm:**

```ts
const MEANINGFUL_RAIN_MM = 2;

function findNextRain(daily: OpenMeteoResponse['daily']): NextRain | null {
	// Skip index 0 (today). Scan days 1..6.
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
```

### WMO weather code mapping

**File:** `src/lib/components/weather/WeatherIcon.svelte` — takes a `code: number` prop and renders the appropriate icon.

WMO code groups to icon/label:

| Code(s)    | Label               | Icon suggestion |
| ---------- | ------------------- | --------------- |
| 0          | Clear sky           | ☀️ sun          |
| 1          | Mainly clear        | 🌤 sun+cloud    |
| 2          | Partly cloudy       | ⛅              |
| 3          | Overcast            | ☁️              |
| 45, 48     | Foggy               | 🌫              |
| 51, 53, 55 | Drizzle             | 🌦              |
| 61, 63, 65 | Rain                | 🌧              |
| 71, 73, 75 | Snow                | 🌨              |
| 80, 81, 82 | Rain showers        | 🌦              |
| 95         | Thunderstorm        | ⛈               |
| 96, 99     | Thunderstorm + hail | ⛈               |

Use hugeicons. Import pattern (mirrors `mode-toggle.svelte`):

```svelte
import {HugeiconsIcon} from '@hugeicons/svelte' import {(SunIcon, CloudIcon)} from '@hugeicons/core-free-icons'

<HugeiconsIcon icon={SunIcon} color="currentColor" strokeWidth={1.5} class="h-5 w-5" />
```

Browse available icons at hugeicons.com. Prefer icons from `@hugeicons/core-free-icons` (already installed).

### Loading skeleton

Each component embeds its own loading skeleton — the skeleton must match the loaded layout precisely to prevent layout shifts. Do not use a generic spinner or a shared skeleton wrapper.

For the weather widget, the skeleton has two rows matching the loaded state:

- Row 1: a wide rect (icon placeholder) + two stacked rects (temp + high/low) + two small rects (precip/sunrise)
- Row 2: a single medium rect (next-rain label)

Use the shadcn-svelte `Skeleton` component (`$lib/components/ui/skeleton`).

### Connectivity gating and reactivity

```svelte
<script lang="ts">
	import { connectivity } from '$lib/stores/connectivity.svelte';

	// Re-fetch when app comes online (e.g. user was offline, reconnects)
	$effect(() => {
		if (connectivity.online) {
			loadWeather();
		}
	});
</script>
```

Guard `loadWeather()` with a check so it doesn't double-fetch on initial mount if already online. A simple `isFirstLoad` boolean or checking state status handles this.

### UI layout

The widget is a card (`bg-card` surface, rounded, padded). Two rows:

**Row 1 — Today's summary:**

- Left: large weather icon (from `WeatherCode`) + condition label
- Center: current temperature (large, `text-foreground`), high/low in `text-muted-foreground`
- Right: precipitation sum for today (if > 0), sunrise/sunset

**Row 2 — Next rain:**

- If `nextRain` is non-null: "Next rain: {weekday, e.g. Thursday} · {precipitationSum} mm"
- If null: "No rain in the next 7 days"
- If `status === 'offline'`: muted card with offline icon and text "Weather unavailable offline"
- If `status === 'no-location'`: prompt to enable location with a link/button
- If `status === 'loading'`: skeleton placeholders matching the two-row layout

### Temperature units

Open-Meteo defaults to Celsius. For V1, always display Celsius. A `°C` / `°F` toggle is a future enhancement.

---

## Section 2: Upcoming Care

### Files

- `src/lib/components/dashboard/UpcomingCare.svelte`
- Data comes from `careScheduleClient` (Dexie) — fully offline-first

### Data fetching

Schedules already carry a `nextDue` (ISO date-time string) field — it is part of `CareScheduleSchema` and is populated by the existing `GET /plants?include=schedules` hydration. No extra runtime API call is needed.

Add a `getUpcoming(withinDays = 30, limit = 10)` method to `careScheduleClient`:

```ts
async getUpcoming(withinDays = 30, limit = 10): Promise<CareSchedule[]> {
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + withinDays)
  return db.careSchedules
    .filter(s => s.syncDeleted === 0 && s.nextDue <= horizon.toISOString())
    .sortBy('nextDue')
    .then(results => results.slice(0, limit))
}
```

This returns up to 10 schedules with `nextDue` within the next 30 days (plus any overdue items, since their `nextDue` is in the past and therefore also `<= horizon`), sorted by date ascending.

**Hydration note:** The existing hydration (`GET /plants?include=schedules`) covers `nextDue` for all plant-linked schedules. As a belt-and-suspenders measure, `hydrateFromApi()` can optionally call `GET /schedules/due?asOf={today+30days ISO string}` as a supplemental upsert to catch any orphaned schedules. The `asOf` query parameter controls the upper bound — without it the endpoint only returns currently due/overdue records. Verify during implementation whether the supplemental call is actually needed.

### Loading skeleton

Matches the loaded layout: a vertical list of N skeleton rows, each shaped like a care item card (icon placeholder + two text lines + date chip). Use `Skeleton` from `$lib/components/ui/skeleton`.

### UI

A vertical list of up to 10 care item cards, sorted `nextDue` ascending. Overdue and upcoming items appear in the same list — overdue items naturally float to the top since their dates are in the past.

Each card:

- Plant name + thumbnail (join via `plantId`)
- Care type label and icon (from `careTypeClient`)
- Due date: relative label — "Today", "Tomorrow", "In 3 days", or "2 days overdue"
- Overdue visual indicator: warning colour on the date label and/or a left border accent

A "Mark done" action logs a care entry via `careLogClient` (local-first write, synced later).

---

## Section 3: My Plants

### Files

- `src/lib/components/dashboard/MyPlants.svelte`
- Data comes from `plantClient.getAll()` (Dexie) — fully offline-first

### Data fetching

```ts
import { plantClient } from '$lib/clients/plantClient';

const plants = await plantClient.getAll();
```

No online dependency. Works offline immediately.

### UI

A responsive card grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`). Each card shows:

- Plant photo (or placeholder icon)
- Common name
- Last care date
- A link to the plant detail page

---

## Route page structure

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import WeatherWidget from '$lib/components/weather/WeatherWidget.svelte';
	import UpcomingCare from '$lib/components/dashboard/UpcomingCare.svelte';
	import MyPlants from '$lib/components/dashboard/MyPlants.svelte';
</script>

<div class="flex flex-col gap-6 p-4">
	<WeatherWidget />
	<UpcomingCare />
	<MyPlants />
</div>
```

---

## Implementation order

1. `src/lib/api/openMeteo.ts` — fetch function + types (unit-testable in Node, no browser APIs)
2. `src/lib/components/weather/WeatherIcon.svelte` — pure display, no state
3. `src/lib/components/weather/WeatherWidget.svelte` — wire everything together
4. `src/routes/dashboard/+page.svelte` + `+page.ts` — route scaffold, drop in WeatherWidget
5. `UpcomingCare` — after the `/schedules/due` API contract is confirmed
6. `MyPlants` — straightforward, can be done any time after the route exists

---

## Testing

- `openMeteo.ts` functions: unit test in `*.spec.ts` (Node env) with `vi.stubGlobal('fetch', ...)` to mock the HTTP call. Test the `findNextRain` algorithm exhaustively (no rain, rain today only, rain on day 3, etc.).
- `WeatherWidget.svelte`: browser component test (`*.svelte.spec.ts`) mocking `fetch` and `navigator.geolocation`. Test each state (loading, offline, no-location, ready).
