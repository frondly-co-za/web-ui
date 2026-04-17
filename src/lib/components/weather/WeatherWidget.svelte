<script lang="ts">
	import { onMount } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		CloudOffIcon,
		LocationOfflineIcon,
		LocationIcon,
		SunriseIcon,
		SunsetIcon,
		RainIcon
	} from '@hugeicons/core-free-icons';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import WeatherIcon from './WeatherIcon.svelte';
	import { fetchWeather, type WeatherData } from '$lib/api/openMeteo';
	import { connectivity } from '$lib/stores/connectivity.svelte';

	type WeatherState =
		| { status: 'loading' }
		| { status: 'offline' }
		| { status: 'no-location' }
		| { status: 'error'; message: string }
		| { status: 'ready'; data: WeatherData };

	let widgetState: WeatherState = $state({ status: 'loading' });
	let locationName: string | undefined = $state(undefined);

	const COORDS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

	interface CachedCoords {
		lat: number;
		lng: number;
		cachedAt: number;
		locationName?: string;
	}

	function getCachedCoords(): CachedCoords | null {
		try {
			const raw = localStorage.getItem('frondly:weather:coords');
			if (!raw) return null;
			const coords = JSON.parse(raw) as CachedCoords;
			if (!coords.cachedAt || Date.now() - coords.cachedAt > COORDS_TTL_MS) return null;
			return coords;
		} catch {
			return null;
		}
	}

	function cacheCoords(lat: number, lng: number, name?: string) {
		localStorage.setItem(
			'frondly:weather:coords',
			JSON.stringify({ lat, lng, cachedAt: Date.now(), locationName: name })
		);
	}

	async function fetchLocationName(lat: number, lng: number): Promise<string | undefined> {
		try {
			const res = await fetch(
				`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
			);
			if (!res.ok) return undefined;
			const data = await res.json();
			return (data.locality || data.city || data.principalSubdivision) ?? undefined;
		} catch {
			return undefined;
		}
	}

	async function getCoords(): Promise<CachedCoords> {
		const cached = getCachedCoords();
		if (cached) {
			locationName = cached.locationName;
			return cached;
		}

		return new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error('no-location'));
				return;
			}
			navigator.geolocation.getCurrentPosition(
				async (pos) => {
					const { latitude: lat, longitude: lng } = pos.coords;
					const name = await fetchLocationName(lat, lng);
					locationName = name;
					cacheCoords(lat, lng, name);
					resolve({ lat, lng, cachedAt: Date.now(), locationName: name });
				},
				() => reject(new Error('no-location'))
			);
		});
	}

	const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

	async function loadWeather(background = false) {
		if (!connectivity.online) {
			widgetState = { status: 'offline' };
			return;
		}

		if (!background) widgetState = { status: 'loading' };

		try {
			const coords = await getCoords();
			const data = await fetchWeather(coords.lat, coords.lng);
			widgetState = { status: 'ready', data };
		} catch (err) {
			if (background) return;
			if (err instanceof Error && err.message === 'no-location') {
				widgetState = { status: 'no-location' };
			} else {
				widgetState = {
					status: 'error',
					message: err instanceof Error ? err.message : 'Unknown error'
				};
			}
		}
	}

	let effectInitialized = false;

	onMount(() => {
		loadWeather();
		const interval = setInterval(() => loadWeather(true), REFRESH_INTERVAL_MS);
		return () => clearInterval(interval);
	});

	// Re-fetch when the app comes back online. Skip the first run (initial mount
	// is handled by onMount above).
	$effect(() => {
		const online = connectivity.online;
		if (!effectInitialized) {
			effectInitialized = true;
			return;
		}
		if (online) loadWeather();
	});

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatNextRainDate(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		const tomorrow = new Date(Date.now() + 86_400_000);

		if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
		return d.toLocaleDateString([], { weekday: 'long' });
	}
</script>

<Card.Root class="pb-4">
	<Card.Content class="px-6">
		{#if widgetState.status === 'loading'}
			{#if locationName}
				<div class="mb-3 flex items-center gap-1">
					<Skeleton class="h-3.5 w-3.5 shrink-0" />
					<Skeleton class="h-3.5 w-24" />
				</div>
			{/if}
			<div class="flex items-center gap-4">
				<Skeleton class="h-12 w-12 shrink-0" />
				<div class="flex flex-1 flex-col gap-1">
					<Skeleton class="h-8 w-20" />
					<Skeleton class="mt-1 h-4 w-28" />
				</div>
				<div class="flex flex-col items-end gap-1">
					<Skeleton class="h-3.5 w-16" />
					<Skeleton class="h-3.5 w-20" />
				</div>
			</div>
			<div class="mt-3 flex items-center gap-1.5">
				<Skeleton class="h-4 w-4 shrink-0" />
				<Skeleton class="h-4 w-44" />
			</div>
		{:else if widgetState.status === 'offline'}
			<div class="flex items-center gap-3 text-muted-foreground">
				<HugeiconsIcon
					icon={CloudOffIcon}
					color="currentColor"
					strokeWidth={1.5}
					class="h-7 w-7 shrink-0"
				/>
				<span class="text-sm">Weather unavailable offline</span>
			</div>
		{:else if widgetState.status === 'no-location'}
			<div class="flex items-center gap-3 text-muted-foreground">
				<HugeiconsIcon
					icon={LocationOfflineIcon}
					color="currentColor"
					strokeWidth={1.5}
					class="h-7 w-7 shrink-0"
				/>
				<div class="text-sm">
					<p>Location access required for weather.</p>
					<button
						class="mt-0.5 text-primary underline underline-offset-2"
						onclick={() => loadWeather()}
					>
						Try again
					</button>
				</div>
			</div>
		{:else if widgetState.status === 'error'}
			<div class="text-sm text-destructive">
				Could not load weather. <button
					class="underline underline-offset-2"
					onclick={() => loadWeather()}>Retry</button
				>
			</div>
		{:else}
			{@const { today, current, nextRain } = widgetState.data}
			{#if locationName}
				<div class="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
					<HugeiconsIcon
						icon={LocationIcon}
						color="currentColor"
						strokeWidth={1.5}
						class="h-3.5 w-3.5 shrink-0"
					/>
					{locationName}
				</div>
			{/if}
			<!-- Row 1: current conditions -->
			<div class="flex items-center gap-4">
				<div class="shrink-0 text-primary">
					<WeatherIcon code={current.weatherCode} class="h-12 w-12" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="text-3xl leading-none font-semibold text-foreground">
						{current.temperature}°C
					</div>
					<div class="mt-1 text-sm text-muted-foreground">
						{Math.round(today.high)}° / {Math.round(today.low)}°
					</div>
				</div>
				<div class="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
					{#if today.precipitationSum > 0}
						<span class="flex items-center gap-1">
							<HugeiconsIcon
								icon={RainIcon}
								color="currentColor"
								strokeWidth={1.5}
								class="h-3.5 w-3.5"
							/>
							{today.precipitationSum} mm today
						</span>
					{/if}
					<span class="flex items-center gap-1">
						<HugeiconsIcon
							icon={SunriseIcon}
							color="currentColor"
							strokeWidth={1.5}
							class="h-3.5 w-3.5"
						/>
						{formatTime(today.sunrise)}
					</span>
					<span class="flex items-center gap-1">
						<HugeiconsIcon
							icon={SunsetIcon}
							color="currentColor"
							strokeWidth={1.5}
							class="h-3.5 w-3.5"
						/>
						{formatTime(today.sunset)}
					</span>
				</div>
			</div>

			<!-- Row 2: next rain -->
			<div class="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
				<HugeiconsIcon
					icon={RainIcon}
					color="currentColor"
					strokeWidth={1.5}
					class="h-4 w-4 shrink-0"
				/>
				{#if nextRain}
					Next rain: <span class="font-medium text-foreground"
						>{formatNextRainDate(nextRain.date)}</span
					>
					· {nextRain.precipitationSum} mm
				{:else}
					No rain in the next 7 days
				{/if}
			</div>
		{/if}
		<p class="mt-2 text-right text-xs text-muted-foreground/60">
			Weather by <a
				href="https://open-meteo.com/"
				target="_blank"
				rel="noopener noreferrer"
				class="underline underline-offset-2 hover:text-muted-foreground">Open-Meteo</a
			>
		</p>
	</Card.Content>
</Card.Root>
