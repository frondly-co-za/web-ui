<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import {
		DropdownMenu,
		DropdownMenuTrigger,
		DropdownMenuContent,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuItem
	} from '$lib/components/ui/dropdown-menu';
	import { auth } from '$lib/auth.svelte';

	onMount(() => auth.init());

	const loginHref = $derived(`/login?returnTo=${encodeURIComponent(page.url.pathname)}`);

	const initials = $derived(() => {
		const name = auth.user?.name;
		if (!name) return '?';
		return name
			.split(' ')
			.map((n) => n[0])
			.slice(0, 2)
			.join('')
			.toUpperCase();
	});
</script>

{#if !auth.isLoading}
	{#if auth.isAuthenticated}
		<DropdownMenu>
			<DropdownMenuTrigger>
				<Avatar class="cursor-pointer">
					<AvatarImage src={auth.user?.picture} alt={auth.user?.name ?? 'Profile'} />
					<AvatarFallback>{initials()}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>
					<div>{auth.user?.name}</div>
					<div class="text-xs font-normal text-muted-foreground">{auth.user?.email}</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => goto(resolve('/logout'))}>Log out</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	{:else}
		<Button size="sm" href={loginHref}>Log in</Button>
	{/if}
{/if}
