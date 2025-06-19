<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import {
		Settings,
		Key,
		CreditCard,
		Eye,
		EyeOff,
		Save,
		Loader2,
		AlertTriangle,
		Check,
		CheckCircle,
		Copy,
		Shield,
		ArrowLeft,
		AlertCircle,
		Keyboard
	} from 'lucide-svelte';
	import { client } from '$lib/rpc/hono';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	interface UserSettings {
		credits: number;
		encryptedApiKeys?: Record<string, any>;
		apiKeys?: Record<string, string>;
		keyLogin?: string;
		preferences: {
			defaultModel?: string;
			defaultProvider?: string;
			theme?: string;
		};
	}

	interface ApiKeyState {
		[provider: string]: {
			value: string;
			visible: boolean;
			modified: boolean;
		};
	}

	let userSettings: UserSettings | null = $state(null);
	let apiKeyStates: ApiKeyState = $state({});
	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let initialLoadComplete = $state(false);
	let copySuccess = $state(false);

	const supportedProviders = [
		{ name: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
		{ name: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
		{ name: 'google', label: 'Google', placeholder: 'AI...' },
		{ name: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' }
	];

	onMount(async () => {
		if (browser) {
			await loadUserSettings();
		}
	});

	async function loadUserSettings() {
		try {
			loading = true;
			error = null;

			const response = await client['user-settings'].$get();

			if (!response.ok) {
				throw new Error('Failed to load user settings');
			}

			userSettings = await response.json();

			// Initialize API key states
			apiKeyStates = {};
			supportedProviders.forEach((provider) => {
				const hasKey = userSettings?.apiKeys?.[provider.name];
				apiKeyStates[provider.name] = {
					value: hasKey ? hasKey : '',
					visible: false,
					modified: false
				};
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to load settings';
			error = errorMessage;
			toast(errorMessage, { icon: AlertCircle });
			console.error('Failed to load user settings:', err);
		} finally {
			loading = false;
			initialLoadComplete = true;
		}
	}

	async function saveSettings() {
		try {
			saving = true;
			error = null;

			const apiKeysToSave: Record<string, string> = {};

			// Only include modified API keys
			Object.entries(apiKeyStates).forEach(([provider, state]) => {
				if (state.modified && state.value && state.value.trim() !== '') {
					apiKeysToSave[provider] = state.value;
				}
			});

			const payload = {
				apiKeys: Object.keys(apiKeysToSave).length > 0 ? apiKeysToSave : undefined,
				preferences: userSettings?.preferences
			};

			const response = await client['user-settings'].$put({
				json: payload
			});

			if (!response.ok) {
				throw new Error('Failed to save settings');
			}

			toast('Settings saved successfully!', { icon: Check });

			// Reset modified states
			Object.keys(apiKeyStates).forEach((provider) => {
				apiKeyStates[provider].modified = false;
			});

			// Reload settings to get updated state
			setTimeout(() => {
				loadUserSettings();
			}, 1000);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to save settings';
			error = errorMessage;
			toast(errorMessage, { icon: AlertCircle });
			console.error('Failed to save settings:', err);
		} finally {
			saving = false;
		}
	}

	function toggleApiKeyVisibility(provider: string) {
		if (apiKeyStates[provider]) {
			apiKeyStates[provider].visible = !apiKeyStates[provider].visible;
		}
	}

	function updateApiKey(provider: string, value: string) {
		if (!apiKeyStates[provider]) {
			apiKeyStates[provider] = { value: '', visible: false, modified: false };
		}
		apiKeyStates[provider].value = value;
		apiKeyStates[provider].modified = true;
	}

	function formatLoginCode(code: string): string {
		return code.replace(/(.{4})/g, '$1-').slice(0, -1);
	}

	async function copyLoginCode() {
		if (userSettings?.keyLogin) {
			try {
				await navigator.clipboard.writeText(userSettings.keyLogin);
				copySuccess = true;
				toast('Login code copied to clipboard!', { icon: Check });
				setTimeout(() => {
					copySuccess = false;
				}, 2000);
			} catch (error) {
				console.error('Failed to copy login code:', error);
				toast('Failed to copy login code', { icon: AlertCircle });
			}
		}
	}
</script>

<div class="space-y-6">
	<div class="space-y-4">
		<Button variant="ghost" onclick={() => goto('/')} class="w-fit">
			<ArrowLeft class="mr-2 h-4 w-4" />
			Back to Chat
		</Button>
		<div class="flex items-center gap-3">
			<Settings class="h-6 w-6" />
			<h1 class="text-2xl font-bold">User Settings</h1>
		</div>
	</div>

	{#if loading}
		<Card.Root>
			<Card.Content class="flex items-center justify-center py-8">
				<Loader2 class="h-6 w-6 animate-spin" />
				<span class="ml-2">Loading settings...</span>
			</Card.Content>
		</Card.Root>
	{:else if error}
		<Card.Root>
			<Card.Content class="py-6">
				<div class="text-destructive flex items-center gap-2">
					<AlertTriangle class="h-5 w-5" />
					<span>{error}</span>
				</div>
				<Button class="mt-4" onclick={loadUserSettings}>Retry</Button>
			</Card.Content>
		</Card.Root>
	{:else if userSettings}
		<div class="space-y-6">
			<!-- API Keys Section -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<Key class="h-5 w-5" />
						API Keys
					</Card.Title>
					<Card.Description>
						Add your own API keys to use your accounts directly. If no keys are configured, the
						system will use shared keys and deduct from your credits.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="space-y-4">
						{#each supportedProviders as provider}
							<div class="space-y-2">
								<div class="flex items-center justify-between">
									<label class="text-sm font-medium">{provider.label} API Key</label>
									{#if apiKeyStates[provider.name]?.value && apiKeyStates[provider.name]?.value.trim() !== ''}
										<Badge variant="secondary" class="text-xs">
											<CheckCircle class="mr-1 h-3 w-3" />
											Configured
										</Badge>
									{:else}
										<Badge variant="outline" class="text-xs">Using system key</Badge>
									{/if}
								</div>
								<div class="flex gap-2">
									<div class="relative flex-1">
										<Input
											type={apiKeyStates[provider.name]?.visible ? 'text' : 'password'}
											placeholder={provider.placeholder}
											value={apiKeyStates[provider.name]?.value || ''}
											oninput={(e) => updateApiKey(provider.name, e.target.value)}
											class="pr-10"
										/>
										<button
											type="button"
											class="absolute inset-y-0 right-0 flex items-center pr-3"
											onclick={() => toggleApiKeyVisibility(provider.name)}
										>
											{#if apiKeyStates[provider.name]?.visible}
												<EyeOff class="text-muted-foreground h-4 w-4" />
											{:else}
												<Eye class="text-muted-foreground h-4 w-4" />
											{/if}
										</button>
									</div>
									{#if apiKeyStates[provider.name]?.modified}
										<Badge variant="outline" class="self-center">Modified</Badge>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Login Code Section - Only show for guest users -->
			{#if userSettings.keyLogin}
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Shield class="h-5 w-5" />
							Login Code
						</Card.Title>
						<Card.Description>
							Use this code to access your account from any device. Keep it safe and secure!
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="space-y-4">
							<div class="space-y-2">
								<label class="text-sm font-medium">Your Login Code</label>
								<div class="flex items-center space-x-2">
									<Input
										value={formatLoginCode(userSettings.keyLogin)}
										readonly
										class="bg-muted text-center font-mono"
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
							<div class="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
								<div class="flex items-start space-x-2">
									<Shield class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
									<div class="space-y-1">
										<p class="text-sm font-medium text-amber-800 dark:text-amber-200">
											Important: Save this code!
										</p>
										<p class="text-sm text-amber-700 dark:text-amber-300">
											This is your unique account access code. Store it safely in a password manager
											or secure location.
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Account Balance -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<CreditCard class="h-5 w-5" />
						Account Balance
					</Card.Title>
					<Card.Description>
						Credits are used when system API keys are used (no user keys configured)
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div class="rounded-lg border p-4 text-center">
							<div class="text-2xl font-bold">£{(userSettings.credits / 100).toFixed(2)}</div>
							<div class="text-muted-foreground text-sm">Current Balance</div>
							{#if userSettings.credits <= 500}
								<Badge variant="destructive" class="mt-2">Low balance</Badge>
							{/if}
						</div>
						<div class="rounded-lg border p-4 text-center">
							<div class="text-2xl font-bold">£0.00</div>
							<div class="text-muted-foreground text-sm">This Month</div>
						</div>
						<div class="rounded-lg border p-4 text-center">
							<div class="text-2xl font-bold">0</div>
							<div class="text-muted-foreground text-sm">Messages</div>
						</div>
					</div>
					<Button class="mt-4 w-full">Add Credits</Button>
				</Card.Content>
			</Card.Root>

			<!-- Preferences -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Preferences</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label class="text-sm font-medium">Default Provider</label>
							<select
								bind:value={userSettings.preferences.defaultProvider}
								class="border-border mt-1 w-full rounded-md border px-3 py-2"
							>
								{#each supportedProviders as provider}
									<option value={provider.name}>{provider.label}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="text-sm font-medium">Theme</label>
							<select
								bind:value={userSettings.preferences.theme}
								class="border-border mt-1 w-full rounded-md border px-3 py-2"
							>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
								<option value="system">System</option>
							</select>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Keyboard Shortcuts -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<Keyboard class="h-5 w-5" />
						Keyboard Shortcuts
					</Card.Title>
					<Card.Description>
						Quick access shortcuts to improve your workflow
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="space-y-4">
						<div class="flex items-center justify-between py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium">Search conversations</span>
								<span class="text-xs text-muted-foreground">Focus the search input in sidebar</span>
							</div>
							<div class="flex gap-1">
								<Badge variant="secondary" class="text-xs font-mono">Ctrl</Badge>
								<span class="text-xs text-muted-foreground">+</span>
								<Badge variant="secondary" class="text-xs font-mono">K</Badge>
							</div>
						</div>
						<div class="flex items-center justify-between py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium">New conversation</span>
								<span class="text-xs text-muted-foreground">Start a new chat and focus input</span>
							</div>
							<div class="flex gap-1">
								<Badge variant="secondary" class="text-xs font-mono">Ctrl</Badge>
								<span class="text-xs text-muted-foreground">+</span>
								<Badge variant="secondary" class="text-xs font-mono">Shift</Badge>
								<span class="text-xs text-muted-foreground">+</span>
								<Badge variant="secondary" class="text-xs font-mono">O</Badge>
							</div>
						</div>
						<div class="flex items-center justify-between py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium">Toggle sidebar</span>
								<span class="text-xs text-muted-foreground">Show or hide the conversations sidebar</span>
							</div>
							<div class="flex gap-1">
								<Badge variant="secondary" class="text-xs font-mono">Ctrl</Badge>
								<span class="text-xs text-muted-foreground">+</span>
								<Badge variant="secondary" class="text-xs font-mono">B</Badge>
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Save Button -->
		<div class="flex justify-end">
			<Button onclick={saveSettings} disabled={saving}>
				{#if saving}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{:else}
					<Save class="mr-2 h-4 w-4" />
				{/if}
				Save Settings
			</Button>
		</div>
	{/if}
</div>
