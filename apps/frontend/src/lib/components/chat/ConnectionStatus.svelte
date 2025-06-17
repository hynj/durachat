<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { ChevronDown } from 'lucide-svelte';

	let {
		isWaitingForResponse = $bindable(false),
		showScrollButton = $bindable(false),
		isThinking = false,
		onScrollToBottom
	}: {
		isWaitingForResponse: boolean;
		showScrollButton: boolean;
		isThinking: boolean;
		onScrollToBottom: () => void;
	} = $props();
</script>

<!-- Waiting for response cursor -->
{#if isWaitingForResponse || isThinking}
	<div class="mx-auto max-w-4xl">
		<div class="pt-6 pb-2 text-base leading-7">
			<span class="terminal-cursor font-mono text-lg text-current">
				<span class="cursor-bar cursor-bar-1">|</span>
				<span class="cursor-bar cursor-bar-2">|</span>
				<span class="cursor-bar cursor-bar-3">|</span>
			</span>
		</div>
	</div>
{/if}

<!-- Scroll to bottom button - positioned above chat input -->
{#if showScrollButton}
	<div class="absolute bottom-40 left-1/2 z-20 -translate-x-1/2 transform">
		<Button
			onclick={onScrollToBottom}
			variant="secondary"
			size="sm"
			class="bg-background hover:bg-accent flex h-8 items-center gap-1 rounded-full px-3 py-1 text-xs shadow-lg transition-all hover:shadow-xl"
		>
			<span>Scroll to bottom</span>
			<ChevronDown class="h-3 w-3" />
		</Button>
	</div>
{/if}

<style>
	.terminal-cursor {
		display: inline-block;
		position: relative;
		padding-left: 0.25rem;
		letter-spacing: -0.1em;
	}

	.cursor-bar {
		opacity: 0;
		animation: cursor-bar-animation 1.2s infinite;
	}

	.cursor-bar-1 {
		animation-delay: 0s;
	}

	.cursor-bar-2 {
		animation-delay: 0.3s;
	}

	.cursor-bar-3 {
		animation-delay: 0.6s;
	}

	@keyframes cursor-bar-animation {
		0%, 25% { opacity: 1; }
		75%, 100% { opacity: 0; }
	}
</style>
