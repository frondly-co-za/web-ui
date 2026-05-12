<script lang="ts">
	import type { LocalPlant } from '$lib/db/types';

	let { plant = null }: { plant?: LocalPlant | null } = $props();
</script>

<div class="p-4 text-muted-foreground">
	PlantEditor — {plant ? `editing "${plant.name}"` : 'new plant'}
</div>
