<script lang="ts">
	import type { Usage } from '$lib/db/database';

	export let usage: Usage | undefined;
	export let model: string | undefined;
	export let provider: string | undefined;
	export let responseTime: number | undefined;

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
</script>

{#if usage}
	<div class="message-stats opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-muted-foreground/70 mt-2 flex items-center gap-2 text-[11px]">
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
	</div>
{/if}
