<script lang="ts">
	import { onMount } from 'svelte';
	import ChatContainer from '$lib/components/chat/ChatContainer.svelte';
	import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
	import {
		getUserIdFromCookie,
		verifySession,
		clearSessionCookies,
		createAnonymousSession
	} from '$lib/auth';
	import { dbService } from '$lib/db/database';

	let isAuthenticated = $state(false);
	let isLoading = $state(true);
	let userId = $state<string | null>(null);
	let isDatabaseReady = $state(false);

	onMount(async () => {
		await initializeApp();
	});

	async function initializeApp() {
		try {
			// Step 1: Extract user ID from cookie immediately
			userId = getUserIdFromCookie();

			if (!userId) {
				// No user ID found, show welcome screen
				isAuthenticated = false;
				isLoading = false;
				return;
			}

			// Step 2: Initialize database with user ID in parallel with auth verification
			const [dbResult, authResult] = await Promise.allSettled([
				dbService.initialize(userId),
				verifySession()
			]);

			// Step 3: Handle results
			if (authResult.status === 'fulfilled' && authResult.value) {
				// Auth successful
				if (dbResult.status === 'fulfilled') {
					// Database initialized successfully
					isAuthenticated = true;
					isDatabaseReady = true;
				} else {
					// Database failed but auth succeeded - show error
					console.error('Database initialization failed:', dbResult.reason);
					throw new Error('Failed to initialize database');
				}
			} else {
				// Auth failed - cleanup and show welcome
				console.log('Session verification failed, clearing session');
				await handleAuthFailure();
			}
		} catch (error) {
			console.error('App initialization failed:', error);
			await handleAuthFailure();
		} finally {
			isLoading = false;
		}
	}

	async function handleAuthFailure() {
		// Cleanup database if it was initialized
		if (isDatabaseReady) {
			await dbService.cleanup();
			isDatabaseReady = false;
		}

		// Clear client-side cookies
		clearSessionCookies();

		// Reset state
		userId = null;
		isAuthenticated = false;
	}

	async function handleStartAnonymous() {
		isLoading = true;
		try {
			const success = await createAnonymousSession();
			if (success) {
				// Reinitialize the app after successful registration
				await initializeApp();
			}
		} catch (error) {
			console.error('Failed to create anonymous session:', error);
		} finally {
			if (!isAuthenticated) {
				isLoading = false;
			}
		}
	}
</script>

{#if isLoading}
	<div class="flex min-h-screen items-center justify-center">
		<div class="space-y-4 text-center">
			<div
				class="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
			></div>
			<div class="text-muted-foreground text-sm">
				{userId ? 'Initializing database and verifying session...' : 'Loading...'}
			</div>
		</div>
	</div>
{:else if isAuthenticated && isDatabaseReady}
	<ChatContainer />
{:else}
	<WelcomeScreen onStartAnonymous={handleStartAnonymous} />
{/if}
