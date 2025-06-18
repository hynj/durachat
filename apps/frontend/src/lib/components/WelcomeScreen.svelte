<script lang="ts">
	import { dev } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { MessageCircle, Github, LogIn, Key } from 'lucide-svelte';

	let {
		onStartAnonymous
	}: {
		onStartAnonymous?: () => void;
	} = $props();

	let showCodeLogin = $state(false);
	let loginCode = $state('');
	let loginLoading = $state(false);
	let loginError = $state<string | null>(null);

	function handleGithubLogin() {
		if (dev) {
			const url = new URL('/oauth/login/github', 'http://localhost:5787');
			url.protocol = 'http';
			window.location.href = url.toString();
		} else {
			const url = new URL('/oauth/login/github', location.href);
			url.protocol = 'https';
			window.location.href = url.toString();
		}
	}

	function handleAnonymousStart() {
		if (onStartAnonymous) {
			onStartAnonymous();
		}
	}

	function handleToggleCodeLogin() {
		showCodeLogin = !showCodeLogin;
		loginError = null;
		loginCode = '';
	}

	async function handleCodeLogin() {
		if (!loginCode.trim()) {
			loginError = 'Please enter your login code';
			return;
		}

		loginLoading = true;
		loginError = null;

		try {
			const baseUrl = dev ? 'http://localhost:5787' : '';
			const response = await fetch(`${baseUrl}/auth/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ keyLogin: loginCode.trim() }),
				credentials: 'include'
			});

			if (response.ok) {
				// Success - reload page to trigger authentication
				window.location.reload();
			} else {
				const error = await response.json();
				loginError = error.error || 'Login failed';
			}
		} catch (error) {
			console.error('Login error:', error);
			loginError = 'Network error. Please try again.';
		} finally {
			loginLoading = false;
		}
	}
</script>

<div class="bg-background flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-md">
		<Card.Root class="border-border/20 shadow-lg">
			<Card.Header class="text-center">
				<div
					class="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
				>
					<MessageCircle class="text-primary h-6 w-6" />
				</div>
				<Card.Title class="text-2xl font-bold">Welcome to DuraChat</Card.Title>
				<Card.Description class="text-muted-foreground">
					Start chatting with AI assistants. Sign in for a personalized experience or continue as a
					guest.
				</Card.Description>
			</Card.Header>

			<Card.Content class="space-y-4">
				<!-- GitHub Login Button -->
				<Button onclick={handleGithubLogin} class="w-full" variant="default">
					<Github class="mr-2 h-4 w-4" />
					Continue with GitHub
				</Button>

				<!-- Divider -->
				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<span class="border-border/20 w-full border-t" />
					</div>
					<div class="relative flex justify-center text-xs uppercase">
						<span class="text-muted-foreground px-2">Or</span>
					</div>
				</div>

				{#if !showCodeLogin}
					<!-- Login Options -->
					<div class="space-y-2">
						<Button onclick={handleToggleCodeLogin} class="w-full" variant="outline">
							<Key class="mr-2 h-4 w-4" />
							Login with Code
						</Button>
						<Button onclick={handleAnonymousStart} class="w-full" variant="outline">
							<LogIn class="mr-2 h-4 w-4" />
							Start Chatting as Guest
						</Button>
					</div>
				{:else}
					<!-- Login with Code Form -->
					<div class="space-y-3">
						<div class="space-y-2">
							<Input
								bind:value={loginCode}
								placeholder="Enter your login code"
								disabled={loginLoading}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										handleCodeLogin();
									}
								}}
							/>
							{#if loginError}
								<p class="text-destructive text-sm">{loginError}</p>
							{/if}
						</div>
						<div class="flex gap-2">
							<Button
								onclick={handleCodeLogin}
								class="flex-1"
								variant="default"
								disabled={loginLoading}
							>
								{#if loginLoading}
									<span
										class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
									></span>
								{:else}
									<Key class="mr-2 h-4 w-4" />
								{/if}
								Login
							</Button>
							<Button onclick={handleToggleCodeLogin} variant="outline" disabled={loginLoading}>
								Back
							</Button>
						</div>
					</div>
				{/if}
			</Card.Content>

			<Card.Footer class="text-center">
				<p class="text-muted-foreground text-xs">
					By continuing, you agree to our Terms of Service and Privacy Policy.
				</p>
			</Card.Footer>
		</Card.Root>

		<!-- Features Preview -->
		<div class="mt-8 grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
			<div class="space-y-2">
				<div
					class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20"
				>
					<MessageCircle class="h-4 w-4 text-blue-600 dark:text-blue-400" />
				</div>
				<h3 class="text-sm font-medium">AI Conversations</h3>
				<p class="text-muted-foreground text-xs">Chat with multiple AI models</p>
			</div>

			<div class="space-y-2">
				<div
					class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20"
				>
					<LogIn class="h-4 w-4 text-green-600 dark:text-green-400" />
				</div>
				<h3 class="text-sm font-medium">Seamless Access</h3>
				<p class="text-muted-foreground text-xs">Quick setup with GitHub or guest mode</p>
			</div>

			<div class="space-y-2">
				<div
					class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/20"
				>
					<Github class="h-4 w-4 text-purple-600 dark:text-purple-400" />
				</div>
				<h3 class="text-sm font-medium">Persistent Chats</h3>
				<p class="text-muted-foreground text-xs">Save conversations with account</p>
			</div>
		</div>
	</div>
</div>
