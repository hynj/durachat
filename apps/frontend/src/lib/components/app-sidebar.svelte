<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import {
		Plus,
		Settings,
		User,
		Sun,
		Moon,
		X,
		Wifi,
		WifiOff,
		LogOut,
		Check,
		AlertCircle
	} from 'lucide-svelte';
	import { getRecentConversations, deleteConversation } from '$lib/db/queries';
	import { syncService } from '$lib/services/sync-service';
	import { toggleMode } from 'mode-watcher';
	import ConversationSearch from './conversation-search.svelte';
	import type { Conversation } from '$lib/db/database';
	import { getUserIdFromCookie } from '$lib/auth';
	import { dbService } from '$lib/db/database';
	import { getWebSocketConnected } from '$lib/stores/connection.svelte';
	import { client } from '$lib/rpc/hono';

	let conversations: Conversation[] = $state([]);
	let groupedConversations: Record<string, Conversation[]> = $state({});
	let searchQuery = $state('');
	let userId = $state<string | null>(null);
	let userLoginCode = $state<string | null>(null);
	let isDatabaseReady = $state(false);
	let showDeleteDialog = $state(false);
	let deleteConversationId = $state<string | null>(null);

	// Get conversation refresh context
	const conversationRefreshContext =
		getContext<() => { trigger: () => void; version: () => number }>('conversation-refresh');
	const conversationRefresh = conversationRefreshContext?.();

	function groupConversationsByTime(conversations: Conversation[]): Record<string, Conversation[]> {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
		const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
		const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

		const groups: Record<string, Conversation[]> = {
			Today: [],
			Yesterday: [],
			'Last Week': [],
			'Last Month': [],
			Older: []
		};

		conversations.forEach((conversation) => {
			const conversationDate = new Date(conversation.updatedAt);

			if (conversationDate >= today) {
				groups['Today'].push(conversation);
			} else if (conversationDate >= yesterday) {
				groups['Yesterday'].push(conversation);
			} else if (conversationDate >= lastWeek) {
				groups['Last Week'].push(conversation);
			} else if (conversationDate >= lastMonth) {
				groups['Last Month'].push(conversation);
			} else {
				groups['Older'].push(conversation);
			}
		});

		// Remove empty groups
		Object.keys(groups).forEach((key) => {
			if (groups[key].length === 0) {
				delete groups[key];
			}
		});

		return groups;
	}

	function filterConversations(conversations: Conversation[], query: string): Conversation[] {
		if (!query.trim()) return conversations;

		const lowerQuery = query.toLowerCase();
		return conversations.filter(
			(conversation) =>
				conversation.title.toLowerCase().includes(lowerQuery) ||
				conversation.model.toLowerCase().includes(lowerQuery) ||
				conversation.provider.toLowerCase().includes(lowerQuery)
		);
	}

	async function loadConversations() {
		// Only load conversations if database is ready
		if (!isDatabaseReady) {
			console.log('Database not ready, skipping conversation load');
			return;
		}

		try {
			conversations = await getRecentConversations(20);
			updateGroupedConversations();
		} catch (error) {
			console.error('Failed to load conversations:', error);
		}
	}

	function updateGroupedConversations() {
		const filtered = filterConversations(conversations, searchQuery);
		groupedConversations = groupConversationsByTime(filtered);
	}

	function formatLoginCode(code: string): string {
		// Format code as ABCD-EFGH-IJKL-MNOP
		return code.replace(/(.{4})/g, '$1-').slice(0, -1);
	}

	async function fetchUserLoginCode() {
		try {
			const response = await client['user-settings'].$get();
			if (response.ok) {
				const settings = await response.json();
				userLoginCode = settings.keyLogin;
			}
		} catch (error) {
			console.error('Failed to fetch user login code:', error);
		}
	}

	function handleSearchChange(query: string) {
		searchQuery = query;
		updateGroupedConversations();
	}

	// Update grouped conversations when search query changes
	$effect(() => {
		updateGroupedConversations();
	});

	onMount(async () => {
		// Get current user ID
		userId = getUserIdFromCookie();

		// Fetch login code for authenticated users
		if (userId) {
			await fetchUserLoginCode();
		}

		// Wait for database to be ready, then load conversations and sync
		const waitForDatabase = async () => {
			while (!dbService.isInitialized()) {
				await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
			}

			// Database is ready!
			isDatabaseReady = true;
			console.log('Database is ready, loading conversations and starting sync');

			// Load conversations
			await loadConversations();

			// Start sync
			try {
				await syncService.sync();
			} catch (error) {
				console.error('Initial sync failed:', error);
			}
		};

		// Start waiting for database (non-blocking)
		waitForDatabase();

		// Listen for conversation title updates
		const handleTitleUpdate = (event: CustomEvent) => {
			console.log('🔄 Sidebar received title update:', event.detail);
			loadConversations(); // Refresh conversations list
		};

		// Listen for sync completion to refresh UI
		const handleSyncCompleted = () => {
			console.log('🔄 Sync completed, refreshing conversations');
			loadConversations();
		};

		window.addEventListener('conversation-title-updated', handleTitleUpdate as EventListener);
		syncService.addEventListener('sync-completed', handleSyncCompleted as EventListener);

		return () => {
			window.removeEventListener('conversation-title-updated', handleTitleUpdate as EventListener);
			syncService.removeEventListener('sync-completed', handleSyncCompleted as EventListener);
		};
	});

	// Watch for conversation refresh trigger from context
	$effect(() => {
		// This effect runs whenever conversationRefresh.version() changes
		if (conversationRefresh) {
			const version = conversationRefresh.version();
			console.log('🔄 Sidebar refresh triggered, version:', version);
			loadConversations();
		}
	});

	async function handleNewChat() {
		// Generate a new conversation ID immediately
		const { uuidv7 } = await import('uuidv7');
		const newConversationId = uuidv7();

		// Navigate to new conversation with ID
		goto(`/?c=${newConversationId}`);
	}

	function handleChatSelect(conversationId: string) {
		// Navigate to specific conversation
		goto(`/?c=${conversationId}`);
	}

	async function handleDeleteConversation(conversationId: string, event: Event) {
		event.stopPropagation(); // Prevent card click
		deleteConversationId = conversationId;
		showDeleteDialog = true;
	}

	async function confirmDeleteConversation() {
		if (!deleteConversationId) return;

		try {
			// Delete locally
			await deleteConversation(deleteConversationId);

			// Server sync is handled through the sync service

			// Refresh conversations list
			await loadConversations();

			// If we're currently viewing this conversation, navigate to home
			if ($page.url.searchParams.get('c') === deleteConversationId) {
				goto('/');
			}

			toast('Conversation deleted successfully', { icon: Check });
		} catch (error) {
			console.error('Failed to delete conversation:', error);
			toast('Failed to delete conversation. Please try again.', { icon: AlertCircle });
		} finally {
			showDeleteDialog = false;
			deleteConversationId = null;
		}
	}

	function handleProfile() {
		goto('/profile');
	}

	function handleSettings() {
		goto('/settings');
	}

	function handleLogout() {
		// Clear cookies by setting them to expire in the past
		document.cookie = 'session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
		document.cookie = 'user_do_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

		// Reload the page to trigger the authentication flow
		window.location.reload();
	}
</script>

<Sidebar.Root>
	<Sidebar.Header class="py-4 pr-4 pl-16">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">DuraChat</h2>
			<Button variant="outline" size="sm" class="h-8 w-8 p-0" onclick={handleNewChat}>
				<Plus class="h-4 w-4" />
			</Button>
		</div>
	</Sidebar.Header>

	<Sidebar.Content class="no-scrollbar flex-1">
		<div class="p-4">
			<ConversationSearch {searchQuery} onSearchChange={handleSearchChange} />
			<div
				class="no-scrollbar ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 size-full h-[calc(100vh-250px)] overflow-y-auto rounded-[inherit] transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-1"
			>
				{#if Object.keys(groupedConversations).length === 0}
					<div class="text-muted-foreground p-4 text-center text-sm">No conversations yet</div>
				{:else}
					{#each Object.entries(groupedConversations) as [timeGroup, groupConversations] (timeGroup)}
						<div class="no-scrollbar mb-6">
							<h3 class="text-sidebar-foreground/80 mb-3 text-sm font-bold">{timeGroup}</h3>
							<div class="no-scrollbar space-y-2">
								{#each groupConversations as conversation (conversation.id)}
									<div
										class="group/card hover:bg-primary/80 hover:text-primary-foreground relative overflow-hidden rounded-md transition-all duration-200 hover:shadow-md"
									>
										<button
											type="button"
											class="w-full cursor-pointer rounded-md px-3 py-2 text-left"
											onclick={() => handleChatSelect(conversation.id)}
										>
											<div class="flex items-center justify-between">
												<div class="min-w-0 flex-1 pr-6">
													<p class="truncate text-sm font-medium">{conversation.title}</p>
												</div>
											</div>
										</button>
										<!-- Delete button - slides in from right on hover -->
										<div
											class="absolute top-0 -right-12 bottom-0 flex w-12 items-center justify-center opacity-0 transition-all duration-200 ease-out group-hover/card:right-0 group-hover/card:opacity-100"
										>
											<button
												type="button"
												class="hover:bg-destructive/30 hover:text-destructive text-primary-foreground flex h-6 w-6 items-center justify-center rounded transition-colors"
												onclick={(e) => handleDeleteConversation(conversation.id, e)}
												title="Delete conversation"
											>
												<X class="h-3 w-3" />
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</Sidebar.Content>

	<Sidebar.Footer class="border-t p-4">
		<!-- Combined Profile Section -->
		{#if userId}
			<Button
				variant="ghost"
				size="sm"
				class="mb-3 h-auto w-full justify-start p-2"
				onclick={handleProfile}
			>
				<div class="flex w-full items-center space-x-3">
					<div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
						<User class="text-primary h-4 w-4" />
					</div>
					<div class="min-w-0 flex-1 text-left">
						<p class="truncate text-sm font-medium">Profile</p>
						<p class="text-muted-foreground truncate font-mono text-xs">
							{userLoginCode ? formatLoginCode(userLoginCode) : 'Loading...'}
						</p>
					</div>
					<div
						class="flex items-center"
						title={getWebSocketConnected() ? 'Connected' : 'Disconnected'}
					>
						{#if getWebSocketConnected()}
							<Wifi class="h-4 w-4 text-green-500" />
						{:else}
							<WifiOff class="h-4 w-4 text-red-500" />
						{/if}
					</div>
				</div>
			</Button>
		{:else}
			<Button variant="ghost" size="sm" class="mb-3 w-full justify-start" onclick={handleProfile}>
				<User class="mr-2 h-4 w-4" />
				Profile
			</Button>
		{/if}

		<!-- Action Buttons -->
		<div class="flex items-center space-x-2">
			<Button
				variant="ghost"
				size="sm"
				class="h-8 w-8 flex-1 p-0"
				onclick={toggleMode}
				title="Toggle theme"
			>
				<Sun class="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
				<Moon
					class="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
				/>
			</Button>
			<Button variant="ghost" size="sm" class="h-8 w-8 flex-1 p-0" onclick={handleSettings}>
				<Settings class="h-4 w-4" />
			</Button>
			<AlertDialog.Root>
				<AlertDialog.Trigger
					class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground inline-flex h-8 w-8 flex-1 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
					title="Log out"
				>
					<LogOut class="h-4 w-4" />
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Are you sure you want to log out?</AlertDialog.Title>
						<AlertDialog.Description>
							You will be returned to the login screen and will need to sign in again to access your
							account.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action onclick={handleLogout}>Log Out</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>

<!-- Delete Conversation Dialog -->
<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete conversation?</AlertDialog.Title>
			<AlertDialog.Description>
				This conversation and all its messages will be permanently deleted. This action cannot be
				undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel
				onclick={() => {
					showDeleteDialog = false;
					deleteConversationId = null;
				}}>Cancel</AlertDialog.Cancel
			>
			<AlertDialog.Action onclick={confirmDeleteConversation}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
