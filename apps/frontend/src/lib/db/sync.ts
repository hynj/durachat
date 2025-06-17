import { eq } from 'drizzle-orm';
import { dbService, settings } from './database';

/**
 * Sync management for keeping local SQLite in sync with backend
 */

const SYNC_METADATA_KEY = 'last_sync_timestamp';

export interface SyncState {
	lastSyncTimestamp: number;
	isOnline: boolean;
	isSyncing: boolean;
}

/**
 * Get the last sync timestamp from local storage
 */
export async function getLastSyncTimestamp(): Promise<number> {
	// Check if database is initialized
	if (!dbService.isInitialized()) {
		console.log('Database not initialized, returning default sync timestamp');
		return 0;
	}

	const db = await dbService.getDb();

	try {
		const result = await db.select().from(settings).where(eq(settings.id, SYNC_METADATA_KEY));

		if (result.length > 0) {
			return parseInt(result[0].value);
		}
	} catch (error) {
		console.log('No previous sync timestamp found');
	}

	return 0; // If no previous sync, start from beginning of time
}

/**
 * Update the last sync timestamp
 */
export async function updateLastSyncTimestamp(timestamp: number): Promise<void> {
	// Check if database is initialized
	if (!dbService.isInitialized()) {
		console.log('Database not initialized, skipping sync timestamp update');
		return;
	}

	const db = await dbService.getDb();

	await db
		.insert(settings)
		.values({
			id: SYNC_METADATA_KEY,
			value: timestamp.toString()
		})
		.onConflictDoUpdate({
			target: settings.id,
			set: {
				value: timestamp.toString()
			}
		});
}

/**
 * Get current timestamp for sync operations
 */
export function getCurrentTimestamp(): number {
	return Date.now();
}
