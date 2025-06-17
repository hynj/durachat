<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ChevronDown, Brain } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import {
		supportsReasoningEffort as checkSupportsReasoningEffort,
		getReasoningEffortLevels,
		getDefaultReasoningEffort
	} from 'backend/src/config/models';

	let {
		modelId = '',
		provider = '',
		reasoningEffort = $bindable('medium'),
		onReasoningEffortChange = () => {},
		disabled = false
	}: {
		modelId?: string;
		provider?: string;
		reasoningEffort?: string;
		onReasoningEffortChange?: (effort: string) => void;
		disabled?: boolean;
	} = $props();

	let supportsReasoningEffort = $derived(checkSupportsReasoningEffort(modelId));
	let availableLevels = $derived(getReasoningEffortLevels(modelId));
	let defaultEffort = $derived(getDefaultReasoningEffort(modelId));
	
	let isOpen = $state(false);
	
	// Initialize with model default if not set
	$effect(() => {
		if (supportsReasoningEffort && !reasoningEffort && defaultEffort) {
			reasoningEffort = defaultEffort;
			onReasoningEffortChange(reasoningEffort);
		}
	});

	function handleSelect(level: string) {
		reasoningEffort = level;
		onReasoningEffortChange(level);
		isOpen = false;
	}

	function formatLevel(level: string): string {
		return level.charAt(0).toUpperCase() + level.slice(1);
	}

	function getLevelDescription(level: string): string {
		switch (level) {
			case 'low':
				return 'Faster responses, less thorough reasoning';
			case 'medium':
				return 'Balanced speed and reasoning quality';
			case 'high':
				return 'Most thorough reasoning, slower responses';
			default:
				return '';
		}
	}
</script>

{#if supportsReasoningEffort && availableLevels.length > 0}
	<div class="relative">
		<Button
			variant="ghost"
			size="sm"
			class="h-8 px-2 text-xs"
			onclick={() => isOpen = !isOpen}
			{disabled}
		>
			<Brain class="h-3 w-3 mr-1" />
			<span class="hidden sm:inline">{formatLevel(reasoningEffort)}</span>
			<ChevronDown class="h-3 w-3 ml-1" />
		</Button>

		{#if isOpen}
			<div
				class="absolute bottom-full left-0 z-50 min-w-[120px] mb-1 rounded-md border bg-card shadow-md p-1"
			>
				{#each availableLevels as level (level)}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
						onclick={() => handleSelect(level)}
					>
						<span>{formatLevel(level)}</span>
						{#if reasoningEffort === level}
							<div class="h-2 w-2 rounded-full bg-primary"></div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}