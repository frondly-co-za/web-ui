<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth.svelte';
	import { page } from '$app/stores';

	onMount(() => {
		const returnTo = $page.url.searchParams.get('returnTo') ?? '/';
		auth.login(returnTo);
	});
</script>
