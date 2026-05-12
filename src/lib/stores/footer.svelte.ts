import type { Snippet } from 'svelte';

let footerSnippet: Snippet | undefined = $state(undefined);

export const footerStore = {
	get snippet() {
		return footerSnippet;
	},
	set(s: Snippet | undefined) {
		footerSnippet = s;
	}
};
