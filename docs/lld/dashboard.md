# Dashboard — Implementation Guide

This document covers the home/dashboard page (`/`) and its three sections, the context-aware footer pattern, and the plant editor entry points. Read the ADR at `docs/adr/001-weather-widget.md` before working on the weather widget.

---

## Page layout

**Route:** `src/routes/+page.svelte` (the base `/` route — there is no separate `/dashboard` path)
**Load file:** `src/routes/+page.ts` — exports `ssr = false`, `prerender = false`

Three vertically stacked sections inside a `<Container>`, responsive (single column on mobile, wider on desktop):

1. **WeatherWidget** — top
2. **UpcomingCare** — middle
3. **MyPlants** — bottom

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { Container } from '$lib/components/common';
	import WeatherWidget from '$lib/components/weather/WeatherWidget.svelte';
	import UpcomingCare from '$lib/components/dashboard/UpcomingCare.svelte';
	import MyPlants from '$lib/components/dashboard/MyPlants.svelte';
</script>

<Container>
	<WeatherWidget />
	<UpcomingCare />
	<MyPlants />
</Container>
```

---

## Section 1: Weather Widget ✅

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

1. Check `localStorage.getItem('frondly:weather:coords')`. If present, valid JSON, and within the 30-day TTL, use it.
2. Otherwise call `navigator.geolocation.getCurrentPosition()`. On success, reverse-geocode the coordinates (via `api.bigdatacloud.net`) to get a locality name, write both to `localStorage`, and proceed. On failure/denial, transition to `no-location` state.

```ts
interface CachedCoords {
	lat: number;
	lng: number;
	cachedAt: number; // Date.now()
	locationName?: string;
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
import {HugeiconsIcon} from '@hugeicons/svelte'; import {(SunIcon, CloudIcon)} from '@hugeicons/core-free-icons';

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
		const online = connectivity.online;
		if (!effectInitialized) {
			effectInitialized = true;
			return;
		}
		if (online) loadWeather();
	});
</script>
```

A `effectInitialized` boolean prevents double-fetching on first mount (initial load is handled by `onMount`). A 15-minute `setInterval` handles background refresh.

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

## Section 2: Upcoming Care ✅

### Files

- `src/lib/components/dashboard/UpcomingCare.svelte`
- `src/lib/clients/careScheduleClient.ts` — `getUpcoming()` method added
- Data is fully offline-first via Dexie

### Data fetching

`getUpcoming(withinDays = 30, limit = 10)` is already implemented on `careScheduleClient`:

```ts
async getUpcoming(withinDays = 30, limit = 10): Promise<LocalCareSchedule[]> {
	const horizon = new Date();
	horizon.setDate(horizon.getDate() + withinDays);
	return db.careSchedules
		.filter((s) => s.syncDeleted === 0 && s.nextDue <= horizon.toISOString())
		.sortBy('nextDue')
		.then((results) => results.slice(0, limit));
}
```

Returns up to 10 schedules with `nextDue` within the next 30 days, plus any overdue items (their `nextDue` is in the past, so `<= horizon`). Sorted ascending so overdue items float to the top.

On load, the component fetches schedules then resolves plant and care type names in a single parallel call (`Promise.all`) using in-memory maps — no N+1 queries.

**Hydration note:** The existing hydration (`GET /plants?include=schedules`) covers `nextDue` for all plant-linked schedules. As a belt-and-suspenders measure, `hydrateFromApi()` can optionally call `GET /schedules/due?asOf={today+30days ISO string}` as a supplemental upsert to catch any orphaned schedules. Verify during implementation whether the supplemental call is actually needed.

### Loading skeleton

3 skeleton rows, each shaped like a care item card: circular icon placeholder + two text lines + date chip.

### UI

A vertical list of up to 10 care item cards, sorted `nextDue` ascending.

Each card:

- Care type icon derived from care type name (watering/misting → droplet, pruning/trimming → scissors, repotting/fertilizing → flower pot, default → leaf)
- Plant name (truncated) + care type label
- Relative due date: "Today", "Tomorrow", "In N days", or "N days overdue"
- Overdue indicator: `text-destructive` on the date label + `border-l-4 border-l-destructive` left accent on the card

**Mark done:** tapping the checkmark icon creates a `careLog` entry via `careLogClient` (local-first, synced later) and optimistically removes the card from the list via a local `markedDone: Set<string>` state. The schedule's `nextDue` will be recomputed by the server on next sync.

---

## Section 3: My Plants ✅

### Files

- `src/lib/components/dashboard/MyPlants.svelte`
- Data comes from `plantClient.getAll()` and `careLogClient.getAll()` — fully offline-first

### Data fetching

Plants and all care logs are fetched in parallel. A `Map<plantId, maxPerformedAt>` is built from the logs to find each plant's last care date without N+1 queries:

```ts
const [plants, logs] = await Promise.all([plantClient.getAll(), careLogClient.getAll()]);
const lastCareByPlant = new Map<string, string>();
for (const log of logs) {
	const existing = lastCareByPlant.get(log.plantId);
	if (!existing || log.performedAt > existing) {
		lastCareByPlant.set(log.plantId, log.performedAt);
	}
}
```

### Loading skeleton

4 skeleton cards in the same grid layout: aspect-ratio square placeholder + two text lines.

### UI

Responsive card grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`). Each card is an `<a>` linking to `/plants/{id}` (plant detail/edit route). Card shows:

- Plant icon placeholder (cover photo not yet available locally — `LocalPlant.coverPhotoId` is set server-side after photo upload)
- Plant name (truncated)
- Last care: "Today", "Yesterday", "N days ago", formatted date, or "No care logged"

**Card header action:** a "+" icon button in the `My Plants` card header linking to `/plants/new` (secondary entry point for adding a plant).

---

## Context-aware footer ✅

### Approach: module-level snippet store

`src/lib/stores/footer.svelte.ts` holds a module-level `$state` with the active snippet. Pages register their snippet in a `$effect` (the cleanup callback clears it on navigation). The layout renders a default Home button when no snippet is set.

**`src/lib/stores/footer.svelte.ts`:**

```ts
import type { Snippet } from 'svelte';

let footerSnippet: Snippet | undefined = $state(undefined);

export const footerStore = {
	get snippet() { return footerSnippet; },
	set(s: Snippet | undefined) { footerSnippet = s; }
};
```

**`src/routes/+layout.svelte`** — renders the active snippet or falls back to a Home button:

```svelte
<AppFooter>
	{#if footerStore.snippet}
		{@render footerStore.snippet()}
	{:else}
		<Button href="/" variant="ghost" class="h-auto flex-col gap-1 rounded-full px-5 py-2">
			<HugeiconsIcon icon={Home01Icon} ... class="size-6" />
			<span class="text-xs font-medium">Home</span>
		</Button>
	{/if}
</AppFooter>
```

**Per-page usage pattern:**

```svelte
<script lang="ts">
	import { footerStore } from '$lib/stores/footer.svelte';

	$effect(() => {
		footerStore.set(myFooter);
		return () => footerStore.set(undefined);
	});
</script>

{#snippet myFooter()}
	<!-- footer content with full access to this page's reactive state -->
{/snippet}
```

### Home page footer

A single ghost button (icon stacked over label, `rounded-full`) linking to `/plants/new`:

```svelte
{#snippet homeFooter()}
	<Button href="/plants/new" variant="ghost" class="h-auto flex-col gap-1 rounded-full px-5 py-2">
		<HugeiconsIcon icon={Plant01Icon} ... class="size-6" />
		<span class="text-xs font-medium">Add plant</span>
	</Button>
{/snippet}
```

A Settings button will be added to the home footer when the settings route exists.

---

## Plant editor entry points ✅

Two entry points both navigate to `/plants/new`:

1. **Footer Add button** — ghost button (icon + label stack) on the home page footer (primary)
2. **My Plants card header button** — outline `Button` with `AddCircleIcon` + "Add plant" label in `Card.Action` (secondary/contextual)

### Routes ✅ (placeholder)

Two explicit routes sharing a single `PlantEditor` component:

| Route               | File                                       | Mode                                          |
| ------------------- | ------------------------------------------ | --------------------------------------------- |
| `/plants/new`       | `src/routes/plants/new/+page.svelte`       | Create — renders `<PlantEditor />`            |
| `/plants/[id]/edit` | `src/routes/plants/[id]/edit/+page.svelte` | Update — loads plant in `onMount`, passes it down |

Both `+page.ts` files export `ssr = false` and `prerender = false`. The edit route's `+page.ts` additionally forwards `params.id`; the `.svelte` file calls `plantClient.getById(data.id)` in `onMount`. No Dexie access in load functions.

**Shared component:** `src/lib/components/plants/PlantEditor.svelte`

```ts
let { plant = null }: { plant?: LocalPlant | null } = $props();
// plant === null/undefined → create mode; plant set → edit mode
```

Currently a placeholder. Design and full implementation to follow in a separate session.

On save (to be implemented):
- Create mode: calls `plantClient.create(...)`, navigates to `/`
- Edit mode: calls `plantClient.update(id, ...)`, navigates back

The plant editor footer (set via `footerStore`) will show a **Save** button that triggers form submission.

---

## Implementation order

| Step | Item                                                              | Status  |
| ---- | ----------------------------------------------------------------- | ------- |
| 1    | `src/lib/api/openMeteo.ts` — fetch + types                        | ✅ done |
| 2    | `WeatherIcon.svelte` — WMO code → icon                            | ✅ done |
| 3    | `WeatherWidget.svelte`                                            | ✅ done |
| 4    | `src/routes/+page.svelte` + `+page.ts`                            | ✅ done |
| 5    | `UpcomingCare.svelte` + `careScheduleClient.getUpcoming()`        | ✅ done |
| 6    | `MyPlants.svelte`                                                 | ✅ done |
| 7    | `footerStore.svelte.ts` + layout wiring + default Home button     | ✅ done |
| 8    | Home page footer snippet (Add Plant button)                       | ✅ done |
| 9    | My Plants card header "Add plant" button                          | ✅ done |
| 10   | `PlantEditor.svelte` + `/plants/new` + `/plants/[id]/edit` routes | ✅ done (placeholder) |
| 11   | `PlantEditor.svelte` — full implementation                        | ⬜ next session |

---

## Testing

- `openMeteo.ts` functions: unit test in `*.spec.ts` (Node env) with `vi.stubGlobal('fetch', ...)` to mock the HTTP call. Test the `findNextRain` algorithm exhaustively (no rain, rain today only, rain on day 3, etc.).
- `WeatherWidget.svelte`: browser component test (`*.svelte.spec.ts`) mocking `fetch` and `navigator.geolocation`. Test each state (loading, offline, no-location, ready).
- `UpcomingCare.svelte`: browser component test. Seed Dexie with schedules (overdue, today, future) and assert rendered labels and overdue styling.
- `MyPlants.svelte`: browser component test. Seed plants + care logs, assert last care labels.
- `PlantEditor.svelte`: browser component test. Test create mode (blank form → save → `plantClient.create` called) and edit mode (prefilled form → save → `plantClient.update` called).
