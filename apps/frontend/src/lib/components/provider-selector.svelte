<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Bot, Check, ChevronDown, Loader2, Search, CreditCard, Key } from 'lucide-svelte';
	import { providerService, type AIProvider } from '$lib/services/provider-service';

	interface Props {
		currentProvider?: string;
		currentModel?: string;
		conversationId?: string;
		onProviderChange?: (provider: string, model: string) => void;
		disabled?: boolean;
		userSettings?: {
			credits: number;
		};
	}

	let {
		currentProvider = 'anthropic',
		currentModel = 'claude-sonnet-4-20250514',
		conversationId,
		onProviderChange,
		disabled = false,
		userSettings
	}: Props = $props();

	let providers: AIProvider[] = $state([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let showSelector = $state(false);
	let switching = $state(false);
	let searchQuery = $state('');

	onMount(async () => {
		console.log('on mount');
		if (browser) {
			await loadProviders();
		}
	});

	async function loadProviders() {
		console.log('laoding providers');
		try {
			loading = true;
			error = null;
			providers = await providerService.getProviders();
			console.log(providers);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load providers';
			console.error('Failed to load providers:', err);
		} finally {
			loading = false;
		}
	}

	async function handleProviderSelect(provider: string, model: string) {
		if (switching || disabled || !browser) return;

		try {
			switching = true;
			error = null;

			// If we have a conversation ID, update it on the server
			if (conversationId) {
				await providerService.switchProvider(conversationId, provider, model);
			}

			// Call the callback
			onProviderChange?.(provider, model);

			// Close selector
			showSelector = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to switch provider';
			console.error('Failed to switch provider:', err);
		} finally {
			switching = false;
		}
	}

	function getCurrentProviderInfo() {
		const provider = providers.find((p) => p.name === currentProvider);
		return {
			providerName: provider?.displayName || currentProvider,
			modelName: provider
				? providerService.getModelDisplayName(currentProvider, currentModel)
				: currentModel
		};
	}

	// Filter providers and models based on search query
	let filteredProviders = $derived(
		providers
			.map((provider) => ({
				...provider,
				models: provider.models.filter((model) => {
					if (!searchQuery.trim()) return true;
					const query = searchQuery.toLowerCase();
					const modelDisplayName = providerService
						.getModelDisplayName(provider.name, model)
						.toLowerCase();
					const providerName = provider.displayName.toLowerCase();
					return (
						modelDisplayName.includes(query) ||
						providerName.includes(query) ||
						model.toLowerCase().includes(query)
					);
				})
			}))
			.filter((provider) => provider.models.length > 0)
	);

	$effect(() => {
		// Close selector when clicking outside
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Element;
			if (!target?.closest('[data-provider-selector]')) {
				showSelector = false;
			}
		}

		if (showSelector) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="relative" data-provider-selector>
	<!-- Current Provider Display Button -->
	<div class="flex items-center gap-2">
		<Button
			variant="ghost"
			size="sm"
			class="h-8 justify-between gap-1 px-2 text-xs font-medium"
			onclick={() => (showSelector = !showSelector)}
			{disabled}
		>
			<span>{loading ? 'Loading...' : getCurrentProviderInfo().modelName}</span>
			{#if switching}
				<Loader2 class="h-3 w-3 animate-spin" />
			{:else}
				<ChevronDown class="h-3 w-3 {showSelector ? 'rotate-180' : ''} transition-transform" />
			{/if}
		</Button>

		<!-- Credit Balance Indicator -->
		{#if userSettings}
			<div class="flex items-center gap-1">
				<Badge variant="outline" class="h-6 px-1.5 text-xs">
					<CreditCard class="mr-1 h-2.5 w-2.5" />
					${(userSettings.credits / 100).toFixed(2)}
				</Badge>
				{#if userSettings.credits <= 10}
					<Badge variant="destructive" class="h-6 px-1.5 text-xs">Low</Badge>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Provider Selector Dropdown -->
	{#if showSelector}
		<Card.Root class="absolute bottom-full left-0 z-[100] mb-2 w-64 shadow-lg">
			<Card.Content class="px-3 pt-0 pb-3">
				{#if loading}
					<div class="flex items-center justify-center py-2">
						<Loader2 class="h-3 w-3 animate-spin" />
						<span class="ml-2 text-xs">Loading...</span>
					</div>
				{:else if error}
					<div class="py-2 text-center">
						<p class="text-destructive text-xs">{error}</p>
						<Button variant="outline" size="sm" class="mt-1 h-6 text-xs" onclick={loadProviders}
							>Retry</Button
						>
					</div>
				{:else if providers.length === 0}
					<div class="py-2 text-center">
						<p class="text-muted-foreground text-xs">No providers available</p>
					</div>
				{:else}
					<!-- Search Input -->
					<div class="relative mb-2">
						<Search
							class="text-muted-foreground absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2"
						/>
						<Input
							bind:value={searchQuery}
							placeholder="Search models..."
							class="h-7 pl-7 text-xs"
						/>
					</div>

					<div class="space-y-2">
						{#each filteredProviders as provider (provider.name)}
							{#each provider.models as model (model)}
								{@const isSelected = currentProvider === provider.name && currentModel === model}
								<Button
									variant={isSelected ? 'default' : 'ghost'}
									size="sm"
									class="h-6 w-full justify-start px-2 text-xs"
									onclick={() => handleProviderSelect(provider.name, model)}
									disabled={switching}
								>
									<span class="truncate">
										{providerService.getModelDisplayName(provider.name, model)}
									</span>
									{#if isSelected}
										<Check class="ml-auto h-3 w-3" />
									{/if}
								</Button>
							{/each}
						{/each}
						{#if filteredProviders.length === 0}
							<div class="py-2 text-center">
								<p class="text-muted-foreground text-xs">No models found</p>
							</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
