<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		SunIcon,
		SunCloudIcon,
		CloudIcon,
		CloudFastWindIcon,
		CloudLittleRainIcon,
		CloudMidRainIcon,
		CloudBigRainIcon,
		CloudSnowIcon,
		CloudLittleSnowIcon,
		SunCloudAngledRainIcon,
		CloudAngledRainZapIcon,
		CloudHailstoneIcon
	} from '@hugeicons/core-free-icons';
	import type { IconSvgElement } from '@hugeicons/svelte';

	interface Props {
		code: number;
		class?: string;
		strokeWidth?: number;
	}

	const { code, class: cls = 'h-8 w-8', strokeWidth = 1.5 }: Props = $props();

	interface CodeEntry {
		icon: IconSvgElement;
		label: string;
	}

	function resolve(c: number): CodeEntry {
		if (c === 0) return { icon: SunIcon, label: 'Clear sky' };
		if (c <= 2) return { icon: SunCloudIcon, label: c === 1 ? 'Mainly clear' : 'Partly cloudy' };
		if (c === 3) return { icon: CloudIcon, label: 'Overcast' };
		if (c === 45 || c === 48) return { icon: CloudFastWindIcon, label: 'Foggy' };
		if (c >= 51 && c <= 55) return { icon: CloudLittleRainIcon, label: 'Drizzle' };
		if (c === 61) return { icon: CloudLittleRainIcon, label: 'Light rain' };
		if (c === 63) return { icon: CloudMidRainIcon, label: 'Rain' };
		if (c === 65) return { icon: CloudBigRainIcon, label: 'Heavy rain' };
		if (c >= 71 && c <= 73) return { icon: CloudLittleSnowIcon, label: 'Snow' };
		if (c === 75) return { icon: CloudSnowIcon, label: 'Heavy snow' };
		if (c >= 80 && c <= 82) return { icon: SunCloudAngledRainIcon, label: 'Rain showers' };
		if (c === 95) return { icon: CloudAngledRainZapIcon, label: 'Thunderstorm' };
		if (c === 96 || c === 99) return { icon: CloudHailstoneIcon, label: 'Thunderstorm with hail' };
		return { icon: CloudIcon, label: 'Unknown' };
	}

	const resolved = $derived(resolve(code));
</script>

<HugeiconsIcon icon={resolved.icon} color="currentColor" {strokeWidth} class={cls} />
