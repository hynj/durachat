<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import {
		User,
		Key,
		Copy,
		Check,
		CheckCircle,
		CreditCard,
		Calendar,
		Shield,
		ArrowLeft,
		Trash2,
		AlertCircle
	} from 'lucide-svelte';
	import { client } from '$lib/rpc/hono';
	import { getUserIdFromCookie } from '$lib/auth';
	import { goto } from '$app/navigation';
	import { clearAllData } from '$lib/utils/clear-all-data';

	interface UserSettings {
		credits: number;
		keyLogin?: string;
	}

	let userSettings: UserSettings | null = $state(null);
	let loading = $state(false);
	let copySuccess = $state(false);
	let userId = $state<string | null>(null);
	let showClearAllDialog = $state(false);

	onMount(async () => {
		userId = getUserIdFromCookie();
		if (userId) {
			await loadUserSettings();
		}
	});

	async function loadUserSettings() {
		try {
			loading = true;
			const response = await client['user-settings'].$get();
			if (response.ok) {
				userSettings = await response.json();
			}
		} catch (error) {
			console.error('Failed to load user settings:', error);
		} finally {
			loading = false;
		}
	}

	function formatLoginCode(code: string): string {
		return code.replace(/(.{4})/g, '$1-').slice(0, -1);
	}

	async function copyLoginCode() {
		if (userSettings?.keyLogin) {
			try {
				await navigator.clipboard.writeText(userSettings.keyLogin);
				copySuccess = true;
				setTimeout(() => {
					copySuccess = false;
				}, 2000);
			} catch (error) {
				console.error('Failed to copy login code:', error);
			}
		}
	}

	function formatCredits(credits: number): string {
		return `£${(credits / 100).toFixed(2)}`;
	}

	function handleClearAll() {
		showClearAllDialog = true;
	}

	async function confirmClearAll() {
		try {
			await clearAllData();

			// Navigate to home
			goto('/');

			toast('All conversations and messages have been deleted.', { icon: Check });
		} catch (error) {
			console.error('Failed to clear data:', error);
			toast('Failed to clear data. Check console for details.', { icon: AlertCircle });
		} finally {
			showClearAllDialog = false;
		}
	}
</script>

<svelte:head>
	<title>Profile - DuraChat</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-6">
	<div class="space-y-6">
		<!-- Back Button and Profile Header -->
		<div class="space-y-4">
			<Button variant="ghost" onclick={() => goto('/')} class="w-fit">
				<ArrowLeft class="mr-2 h-4 w-4" />
				Back to Chat
			</Button>
			<div class="flex items-center space-x-4">
				<div class="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
					<User class="text-primary h-8 w-8" />
				</div>
				<div>
					<h1 class="text-3xl font-bold">Profile</h1>
					<p class="text-muted-foreground">Your account information and login code</p>
				</div>
			</div>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"
				></div>
			</div>
		{:else if userSettings}
			<div class="grid gap-6 md:grid-cols-2">
				<!-- Login Code Card - Only show for guest users -->
				{#if userSettings.keyLogin}
					<Card.Root>
						<Card.Header>
							<div class="flex items-center space-x-2">
								<Key class="h-5 w-5" />
								<Card.Title>Login Code</Card.Title>
							</div>
							<Card.Description>
								Use this code to log back into your account from any device. Keep it safe!
							</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div class="space-y-2">
								<label class="text-sm font-medium">Your Login Code</label>
								<div class="flex items-center space-x-2">
									<Input
										value={formatLoginCode(userSettings.keyLogin)}
										readonly
										class="text-center font-mono"
									/>
									<Button
										variant="outline"
										size="sm"
										onclick={copyLoginCode}
										disabled={copySuccess}
									>
										{#if copySuccess}
											<CheckCircle class="h-4 w-4 text-green-500" />
										{:else}
											<Copy class="h-4 w-4" />
										{/if}
									</Button>
								</div>
								{#if copySuccess}
									<p class="text-sm text-green-600">Copied to clipboard!</p>
								{/if}
							</div>
							<div class="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/20">
								<div class="flex items-start space-x-2">
									<Shield class="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
									<div class="space-y-1">
										<p class="text-sm font-medium text-amber-800 dark:text-amber-200">
											Save this code!
										</p>
										<p class="text-sm text-amber-700 dark:text-amber-300">
											Store it somewhere safe like a password manager.
										</p>
									</div>
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}

				<!-- Account Info Card -->
				<Card.Root class={userSettings.keyLogin ? '' : 'md:col-span-2'}>
					<Card.Header>
						<div class="flex items-center space-x-2">
							<CreditCard class="h-5 w-5" />
							<Card.Title>Account Information</Card.Title>
						</div>
						<Card.Description>Your account details and usage information</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">Credits Balance</span>
								<Badge variant="secondary" class="font-mono">
									{formatCredits(userSettings.credits)}
								</Badge>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">Account Type</span>
								<Badge variant="outline">Guest User</Badge>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<!-- Data Management Card -->
				<Card.Root class="md:col-span-2">
					<Card.Header>
						<div class="flex items-center space-x-2">
							<Trash2 class="h-5 w-5" />
							<Card.Title>Data Management</Card.Title>
						</div>
						<Card.Description>
							Manage your conversation data and account cleanup options
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="space-y-4">
							<div class="rounded-lg bg-red-50 p-4 dark:bg-red-950/20">
								<div class="space-y-3">
									<div>
										<h4 class="text-sm font-medium text-red-800 dark:text-red-200">
											Clear All Conversations
										</h4>
										<p class="text-sm text-red-700 dark:text-red-300">
											This will permanently delete all your conversations and messages. This action
											cannot be undone.
										</p>
									</div>
									<Button variant="destructive" onclick={handleClearAll} class="w-fit">
										<Trash2 class="mr-2 h-4 w-4" />
										Clear All Data
									</Button>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		{:else}
			<div class="py-8 text-center">
				<p class="text-muted-foreground">Please log in to view your profile</p>
			</div>
		{/if}
	</div>
</div>

<!-- Clear All Data Dialog -->
<AlertDialog.Root bind:open={showClearAllDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear all data?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete ALL conversations and messages. This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel
				onclick={() => {
					showClearAllDialog = false;
				}}>Cancel</AlertDialog.Cancel
			>
			<AlertDialog.Action onclick={confirmClearAll}>Clear All Data</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
