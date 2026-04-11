<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { toggleMode } from 'mode-watcher';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Moon01Icon, Sun01Icon } from '@hugeicons/core-free-icons';
</script>

<Button variant="outline" size="icon" onclick={toggleMode}>
	<HugeiconsIcon
		class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-90"
		icon={Sun01Icon}
		color="currentColor"
		strokeWidth={1.5}
	></HugeiconsIcon>
	<HugeiconsIcon
		class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"
		icon={Moon01Icon}
		color="currentColor"
		strokeWidth={1.5}
	></HugeiconsIcon>
	<span class="sr-only">Toggle Mode</span>
</Button>
