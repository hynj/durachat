<script lang="ts">
	import { onMount } from 'svelte';
	import { dbService } from '$lib/db/database';

	let { children } = $props();
	let isLoading = $state(true);
	let error: string | null = $state(null);

	onMount(async () => {
		try {
			console.log('Starting database initialization...');
			const db = await dbService.initialize();
			console.log('Database initialized successfully:', db);
			console.log('Setting isLoading to false...');
			isLoading = false;
			console.log('isLoading is now:', isLoading);
		} catch (err) {
			console.error('Database initialization failed:', err);
			error = err instanceof Error ? err.message : 'Failed to initialize database';
			console.log('Setting isLoading to false due to error...');
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="bg-background flex h-screen items-center justify-center">
		<div class="space-y-4 text-center">
			<div
				class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"
			></div>
			<div class="text-muted-foreground text-sm">Initializing database...</div>
		</div>
	</div>
{:else if error}
	<div class="bg-background flex h-screen items-center justify-center">
		<div class="max-w-md space-y-4 p-6 text-center">
			<div class="text-sm text-red-500">Database Error</div>
			<div class="text-muted-foreground text-xs">
				{error}
			</div>
			<button
				class="bg-primary text-primary-foreground rounded px-4 py-2 text-sm"
				onclick={() => window.location.reload()}
			>
				Retry
			</button>
		</div>
	</div>
{:else}
	{@render children?.()}
{/if}
