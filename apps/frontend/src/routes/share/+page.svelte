<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { client } from '$lib/rpc/hono';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
	import type { Conversation, Message } from '$lib/db/database';

	let conversation: Conversation | null = $state(null);
	let messages: Message[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);
	let doId: string | null = null;
	let uniqueId: string | null = null;

	onMount(async () => {
		// Parse query parameters to extract doId and uniqueId
		// Expected format: /share?do=doid&id=uniqueid
		const searchParams = $page.url.searchParams;
		doId = searchParams.get('do');
		uniqueId = searchParams.get('id');

		if (doId && uniqueId) {
			try {
				const response = await client['api-share'].view.$get({
					query: {
						do: doId,
						id: uniqueId
					}
				});

				if (response.ok) {
					const data = await response.json();
					conversation = data.conversation;
					messages = data.messages;
				} else {
					const errorData = await response.json();
					error = errorData.error || 'Failed to load shared conversation';
				}
			} catch (err) {
				console.error('Error loading shared conversation:', err);
				error = 'Failed to load shared conversation';
			}
		} else {
			error = 'Invalid share link - missing parameters';
		}

		isLoading = false;
	});
</script>

<svelte:head>
	<title>{conversation ? `Shared: ${conversation.title}` : 'Shared Chat'} - DuraChat</title>
</svelte:head>

<div class="bg-background min-h-screen">
	{#if isLoading}
		<div class="flex min-h-screen items-center justify-center">
			<div class="text-center">
				<div class="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2"></div>
				<p class="text-muted-foreground">Loading shared conversation...</p>
			</div>
		</div>
	{:else if error}
		<div class="flex min-h-screen items-center justify-center">
			<div class="max-w-md text-center">
				<div class="mb-4 text-6xl">😕</div>
				<h1 class="mb-2 text-2xl font-bold">Share Link Not Found</h1>
				<p class="text-muted-foreground mb-4">{error}</p>
				<a
					href="/"
					class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-md px-4 py-2 transition-colors"
				>
					Return to DuraChat
				</a>
			</div>
		</div>
	{:else if conversation && messages}
		<div class="container mx-auto max-w-4xl py-8">
			<!-- Header -->
			<div class="border-border mb-8 border-b pb-4">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-2xl font-bold">{conversation.title}</h1>
						<p class="text-muted-foreground mt-1 text-sm">
							Shared conversation • {messages.length} messages
						</p>
					</div>
					<a
						href="/"
						class="bg-muted text-muted-foreground hover:bg-muted/80 inline-flex items-center rounded-md px-3 py-2 text-sm transition-colors"
					>
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/>
						</svg>
						Open DuraChat
					</a>
				</div>
			</div>


			<!-- Messages -->
			<div class="pb-8">
				<ChatMessages
					{messages}
					allAttachments={[]}
					isStreaming={false}
					reasoningHistory={new Map()}
				/>
			</div>
		</div>
	{/if}
</div>
