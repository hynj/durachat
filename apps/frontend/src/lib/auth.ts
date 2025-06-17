import { client } from '$lib/rpc/hono';

// Extract user ID from cookie immediately (now accessible since httpOnly=false)
export function getUserIdFromCookie(): string | null {
	if (typeof document === 'undefined') return null;

	const cookies = document.cookie.split(';');
	const userDoIdCookie = cookies.find((cookie) => cookie.trim().startsWith('user_do_id='));

	if (!userDoIdCookie) return null;

	const userId = userDoIdCookie.trim().split('=')[1];
	return userId && userId !== '' ? userId : null;
}

// Verify session with server (session_token is HttpOnly so we need server verification)
export async function verifySession(): Promise<boolean> {
	try {
		// Try to make an authenticated request to verify session
		const response = await client.test.validatetest.$get();
		return response.ok;
	} catch (error) {
		console.error('Session verification failed:', error);
		return false;
	}
}

// Simple client-side session check - only checks if user_do_id exists
// Note: This doesn't verify the session is valid, just that cookies are present
export function hasSession(): boolean {
	if (typeof document === 'undefined') return false;

	// We can only check user_do_id since session_token is HttpOnly
	// For full validation, use verifySession()
	const userId = getUserIdFromCookie();
	return userId !== null;
}

// Clear session cookies (for cleanup on auth failure)
export function clearSessionCookies(): void {
	if (typeof document === 'undefined') return;

	// Clear user_do_id cookie (we can only clear the non-HttpOnly one)
	document.cookie = 'user_do_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

	// Note: session_token is HttpOnly and must be cleared by the server
}

// Create anonymous session by calling the register endpoint
export async function createAnonymousSession(): Promise<boolean> {
	try {
		const response = await client.auth.register.$post({
			query: {}
		});

		if (response.ok) {
			// Session cookies should be set automatically
			return true;
		}

		return false;
	} catch (error) {
		console.error('Failed to create anonymous session:', error);
		return false;
	}
}
