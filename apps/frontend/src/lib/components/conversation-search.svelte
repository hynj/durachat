<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		searchQuery?: string;
		onSearchChange?: (query: string) => void;
		placeholder?: string;
	}

	let {
		searchQuery = '',
		onSearchChange,
		placeholder = 'Search conversations...'
	}: Props = $props();

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const query = target.value;
		onSearchChange?.(query);
	}

	function clearSearch() {
		onSearchChange?.('');
	}
</script>

<div class="relative mb-4">
	<Search
		class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
	/>
	<Input
		type="text"
		value={searchQuery}
		oninput={handleInput}
		{placeholder}
		data-search-input
		class="focus:bg-muted/30 h-9 border-0 bg-transparent pr-9 pl-9 text-sm transition-colors focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
	/>
	{#if searchQuery}
		<Button
			variant="ghost"
			size="sm"
			onclick={clearSearch}
			class="hover:bg-muted absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 p-0"
		>
			<X class="h-3 w-3" />
		</Button>
	{/if}
</div>
