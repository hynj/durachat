<script lang="ts">
	import '../app.css';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { setContext } from 'svelte';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();

	// Conversation refresh trigger using Svelte 5 $state
	let conversationRefreshTrigger = $state(0);

	// Provide context function to trigger refresh
	setContext('conversation-refresh', () => ({
		trigger: () => conversationRefreshTrigger++,
		version: () => conversationRefreshTrigger
	}));
</script>

<ModeWatcher />
<Toaster richColors position="top-right" />
<Sidebar.Provider>
	<AppSidebar />

	<!-- Fixed position sidebar toggle - always visible -->
	<div class="fixed top-4 left-4 z-50">
		<Sidebar.Trigger
			class="border-sidebar-border bg-sidebar hover:bg-sidebar-accent inline-flex h-8 w-8 items-center justify-center rounded border transition-all"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="3" x2="21" y1="6" y2="6" />
				<line x1="3" x2="21" y1="12" y2="12" />
				<line x1="3" x2="21" y1="18" y2="18" />
			</svg>
		</Sidebar.Trigger>
	</div>

	<Sidebar.Inset>
		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
