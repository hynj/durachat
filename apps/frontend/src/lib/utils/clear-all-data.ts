import { clearAllLocalData } from '$lib/db/queries';
import { client } from '$lib/rpc/hono';

/**
 * Clears all conversations and messages from both local SQLite and remote backend
 */
export async function clearAllData(): Promise<void> {
	console.log('🧹 Starting complete data clear...');

	try {
		// Clear local SQLite database
		await clearAllLocalData();

		// Clear remote backend database via RPC
		const response = await client.test['clear-all'].$delete();

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Backend clear failed: ${error.error || 'Unknown error'}`);
		}

		const result = await response.json();
		console.log('🎉 All data cleared successfully:', result.message);
	} catch (error) {
		console.error('❌ Failed to clear all data:', error);
		throw error;
	}
}
