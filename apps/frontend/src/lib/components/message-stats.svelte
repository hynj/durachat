<script lang="ts">
	import type { Usage } from '$lib/db/database';
	import { client } from '$lib/rpc/hono';
	import { onMount } from 'svelte';

	export let usage: Usage | undefined;
	export let model: string | undefined;
	export let provider: string | undefined;
	export let responseTime: number | undefined;
	export let conversationId: string | undefined;

	let shareUrl: string | null = null;
	let isGeneratingShareUrl = false;

	function formatCost(costInCents: number): string {
		if (costInCents < 100) {
			return `${costInCents}¢`;
		}
		return `$${(costInCents / 100).toFixed(2)}`;
	}

	function formatTokens(tokens: number): string {
		if (tokens < 1000) {
			return tokens.toString();
		}
		return `${(tokens / 1000).toFixed(1)}k`;
	}

	function getProviderDisplayName(providerName: string): string {
		switch (providerName?.toLowerCase()) {
			case 'anthropic':
				return 'Anthropic';
			case 'google':
				return 'Google';
			case 'openai':
				return 'OpenAI';
			default:
				return providerName || 'Unknown';
		}
	}

	function getModelDisplayName(modelName: string): string {
		if (modelName?.includes('claude-sonnet-4')) {
			return 'Claude 4 Sonnet';
		} else if (modelName?.includes('claude-3-5-sonnet')) {
			return 'Claude 3.5 Sonnet';
		} else if (modelName?.includes('claude-3-5-haiku')) {
			return 'Claude 3.5 Haiku';
		} else if (modelName?.includes('gemini-2.5-flash-preview-05-20-non-thinking')) {
			return 'Gemini 2.5 Flash (Standard)';
		} else if (modelName?.includes('gemini-2.5-flash')) {
			return 'Gemini 2.5 Flash (Thinking)';
		} else if (modelName?.includes('gemini-2.5-pro')) {
			return 'Gemini 2.5 Pro';
		} else if (modelName?.includes('gpt-4.1-nano')) {
			return 'GPT-4.1 Nano';
		} else if (modelName?.includes('gpt-4.1-mini')) {
			return 'GPT-4.1 Mini';
		} else if (modelName?.includes('gpt-4.1')) {
			return 'GPT-4.1';
		} else if (modelName?.includes('o4-mini')) {
			return 'OpenAI o4-mini';
		} else if (modelName?.includes('o3')) {
			return 'OpenAI o3';
		} else if (modelName?.includes('gpt-4')) {
			return 'GPT-4';
		}
		return modelName || 'Unknown Model';
	}

	function formatResponseTime(timeMs: number): string {
		if (timeMs < 1000) {
			return `${Math.round(timeMs)}ms`;
		} else {
			return `${(timeMs / 1000).toFixed(1)}s`;
		}
	}

	async function generateShareUrl() {
		if (!conversationId || isGeneratingShareUrl) return;

		isGeneratingShareUrl = true;
		try {
			const response = await client.share.create.$post({
				json: { conversationId }
			});

			if (response.ok) {
				const data = await response.json();
				shareUrl = `${window.location.origin}${data.shareUrl}`;
			}
		} catch (error) {
			console.error('Failed to generate share URL:', error);
		} finally {
			isGeneratingShareUrl = false;
		}
	}

	async function copyShareUrl() {
		if (!shareUrl) {
			await generateShareUrl();
		}

		if (shareUrl) {
			try {
				await navigator.clipboard.writeText(shareUrl);
			} catch (error) {
				console.error('Failed to copy to clipboard:', error);
			}
		}
	}
</script>

{#if usage}
	<div
		class="message-stats text-muted-foreground/70 mt-2 flex items-center gap-2 text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
	>
		<!-- Model info -->
		<span class="font-medium">
			{getModelDisplayName(model || usage.model)}
		</span>
		<span>({getProviderDisplayName(provider || usage.provider)})</span>

		<!-- Cost -->
		<span class="font-medium">{formatCost(usage.cost)}</span>

		<!-- Tokens -->
		<span>{formatTokens(usage.totalTokens)} tokens</span>

		<!-- Response Time -->
		{#if responseTime}
			<span class="font-medium">{formatResponseTime(responseTime)}</span>
		{/if}

		<!-- Share Button -->
		{#if conversationId}
			<button
				on:click={copyShareUrl}
				disabled={isGeneratingShareUrl}
				class="text-muted-foreground/50 hover:text-muted-foreground ml-1 transition-colors"
				title="Copy share link"
			>
				{#if isGeneratingShareUrl}
					<span class="text-[10px]">...</span>
				{:else}
					<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
						/>
					</svg>
				{/if}
			</button>
		{/if}
	</div>
{/if}
