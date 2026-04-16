<script lang="ts">
	import { onMount } from 'svelte'
	import { Container } from '$lib/components/common'
	import * as Card from '$lib/components/ui/card/index.js'
	import { Spinner } from '$lib/components/ui/spinner'
	import { api } from '$lib/api'

	type Status = 'loading' | 'online' | 'offline'
	let status = $state<Status>('loading')

	onMount(async () => {
		try {
			const res = await api.health()
			status = res.status === 'ok' ? 'online' : 'offline'
		} catch {
			status = 'offline'
		}
	})
</script>

<Container>
	<Card.Root>
		<Card.Header>
			<Card.Title>Welcome to Frondly</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if status === 'loading'}
				<Spinner class="size-5" />
			{:else}
				<span
					class="font-medium"
					class:text-primary={status === 'online'}
					class:text-destructive={status === 'offline'}
				>
					Status: {status === 'online' ? 'Online' : 'Offline'}
				</span>
			{/if}
		</Card.Content>
	</Card.Root>
</Container>
