# ADR 001: Weather Widget — Online-Only, Open-Meteo

**Date:** 2026-04-17  
**Status:** Accepted

---

## Context

The dashboard needs a weather widget showing today's forecast and the next meaningful rain event. Weather data is inherently short-lived and location-dependent. Frondly is primarily a plant care app, so rain is the most operationally relevant weather signal — it determines whether the user needs to water their plants.

The app otherwise follows an offline-first pattern (Dexie + sync engine), but that model is a poor fit for weather: stale weather data is not just unhelpful, it is actively misleading.

---

## Decisions

### 1. Online-only — no caching in IndexedDB

Weather data has a shelf-life measured in hours. Caching it in Dexie would require TTL logic, cache invalidation, and display of stale timestamps — complexity that provides no real user value. If the user is offline, the widget shows a graceful "unavailable offline" state.

**Rejected alternative:** Cache the last fetch in `localStorage` with a timestamp. Not worth the added complexity for V1; Open-Meteo fetches are fast and free.

### 2. Open-Meteo as the weather API provider

Open-Meteo is free for non-commercial use, requires no API key, has excellent global coverage via ECMWF/GFS/etc. ensemble data, and returns structured JSON with daily and hourly breakdowns. No account setup, no key management, no rate-limit concerns at hobby scale.

**Rejected alternative:** OpenWeatherMap — requires API key, free tier is limited, adds key-management overhead.

### 3. Browser Geolocation API for location, cached in `localStorage`

The widget calls `navigator.geolocation.getCurrentPosition()` on first render. Coordinates are cached in `localStorage` (`frondly:weather:coords`) so subsequent loads skip the async geolocation step entirely. The browser's own permission memory handles re-prompt avoidance.

There is no user-configured location in the app yet. Adding one is a separate concern; the geolocation approach gives a working V1 with no new UI.

**Rejected alternative:** Hardcode a default location or require the user to configure one in settings — too much friction for a first visit.

### 4. "Meaningful rain" threshold: ≥ 2 mm/day (daily sum)

For plant care, rain below ~2 mm is not enough to meaningfully water soil — it barely wets the surface. 2 mm/day is a widely used agronomic threshold for "rain that counts." The widget scans `daily.precipitation_sum` from tomorrow onward and reports the first day that meets or exceeds this threshold. If none found within 7 days, it shows "No rain in the next 7 days."

**Rejected alternative:** Use hourly data. More precise but harder to summarise for the user ("Rain at 3 PM Thursday" vs "Rain on Thursday"). Daily resolution is the right UX granularity for this signal.

### 5. Single Open-Meteo request per widget mount

Request both `hourly` and `daily` variables in one call using `timezone=auto`. Hourly data drives current conditions (find the hour slot matching `Date.now()`); daily data drives the today-summary and next-rain scan.

Variables requested:

- **Hourly:** `temperature_2m`, `precipitation`, `weather_code`
- **Daily:** `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `sunrise`, `sunset`

### 6. No `apiFetch` wrapper — plain `fetch`

Open-Meteo is a public API with no auth header. Using the app's `apiFetch` wrapper (which injects Bearer tokens) would be incorrect. Plain `fetch` is used directly.

### 7. Connectivity gating via the existing `connectivity` store

The `connectivity` singleton in `$lib/stores/connectivity.svelte` already does a real HTTP probe before marking `online = true`. The widget imports it and gates the fetch behind `connectivity.online`. A `$effect` re-triggers the fetch if the app comes back online while the dashboard is open.

---

## Consequences

- No offline weather data, ever. This is intentional and expected.
- No API key to manage. Simpler CI/CD and environment configuration.
- Geolocation permission required. The widget must handle denial gracefully.
- A 2 mm threshold is an agronomic convention — it may need tuning based on user feedback.
- Daily granularity for next-rain means "Rain on Thursday" — not "Rain at 3 PM". Acceptable for V1.
