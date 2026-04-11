<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/auth.svelte';

	onMount(async () => {
		const returnTo = await auth.handleCallback();
		goto(resolve(returnTo as Parameters<typeof resolve>[0]), { replaceState: true });
	});
</script>
