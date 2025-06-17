import { client } from '$lib/rpc/hono';
import { getLastSyncTimestamp, updateLastSyncTimestamp, getCurrentTimestamp } from '$lib/db/sync';
import { clearAllLocalData } from '$lib/db/queries';
import { conversations, messages } from 'backend/src/db/user/data';
import { dbService, type Conversation, type Message } from '$lib/db/database';

export interface SyncResult {
	success: boolean;
	conversationsUpdated: number;
	messagesUpdated: number;
	error?: string;
}

/**
 * Main sync service - pulls data from server and updates local SQLite
 */
export class SyncService {
	private isSyncing = false;
	private syncEventTarget = new EventTarget();

	/**
	 * Perform full sync from server
	 */
	async sync(): Promise<SyncResult> {
		if (this.isSyncing) {
			console.log('🔄 Sync already in progress, skipping');
			return {
				success: false,
				conversationsUpdated: 0,
				messagesUpdated: 0,
				error: 'Sync in progress'
			};
		}

		this.isSyncing = true;
		this.dispatchSyncEvent('sync-started');

		try {
			console.log('🔄 Starting sync...');

			// Get last sync timestamp
			const lastSync = await getLastSyncTimestamp();
			console.log('📅 Last sync:', new Date(lastSync));

			// Fetch updates from server
			const response = await client.test.sync.$get({
				query: { lastSync: lastSync.toString() }
			});

			if (!response.ok) {
				throw new Error('Failed to fetch sync data from server');
			}

			const syncData = await response.json();
			console.log('📊 Received sync data:', {
				conversations: syncData.conversations.length,
				messages: syncData.messages.length
			});

			// Apply updates to local database
			const result = await this.applySyncData(syncData);

			// Update sync timestamp
			await updateLastSyncTimestamp(syncData.serverTimestamp);

			console.log('✅ Sync completed successfully');
			this.dispatchSyncEvent('sync-completed', result);

			return result;
		} catch (error) {
			console.error('❌ Sync failed:', error);
			const errorResult = {
				success: false,
				conversationsUpdated: 0,
				messagesUpdated: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
			this.dispatchSyncEvent('sync-failed', errorResult);
			return errorResult;
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Apply sync data to local SQLite database using Drizzle
	 */
	private async applySyncData(syncData: {
		conversations: any[];
		messages: any[];
		serverTimestamp: number;
	}): Promise<SyncResult> {
		const db = await dbService.getDb();

		let conversationsUpdated = 0;
		let messagesUpdated = 0;

		// Update conversations using Drizzle
		for (const conv of syncData.conversations) {
			try {
				await db
					.insert(conversations)
					.values({
						id: conv.id,
						title: conv.title,
						model: conv.model,
						provider: conv.provider,
						systemPrompt: conv.systemPrompt,
						isShared: conv.isShared,
						shareId: conv.shareId,
						parentId: conv.parentId,
						branchPoint: conv.branchPoint,
						createdAt: new Date(conv.createdAt),
						updatedAt: new Date(conv.updatedAt),
						lastSyncAt: new Date(getCurrentTimestamp()),
						isDeleted: conv.isDeleted
					})
					.onConflictDoUpdate({
						target: conversations.id,
						set: {
							title: conv.title,
							model: conv.model,
							provider: conv.provider,
							systemPrompt: conv.systemPrompt,
							isShared: conv.isShared,
							shareId: conv.shareId,
							parentId: conv.parentId,
							branchPoint: conv.branchPoint,
							updatedAt: new Date(conv.updatedAt),
							lastSyncAt: new Date(getCurrentTimestamp()),
							isDeleted: conv.isDeleted
						}
					});
				conversationsUpdated++;
			} catch (error) {
				console.error('Failed to sync conversation:', conv.id, error);
			}
		}

		// Update messages using Drizzle
		for (const msg of syncData.messages) {
			try {
				await db
					.insert(messages)
					.values({
						id: msg.id,
						conversationId: msg.conversationId,
						role: msg.role,
						content: msg.content,
						model: msg.model,
						provider: msg.provider,
						tokenCount: msg.tokenCount,
						order: msg.order,
						parentMessageId: msg.parentMessageId,
						isStreaming: msg.isStreaming,
						streamCompleted: msg.streamCompleted,
						createdAt: new Date(msg.createdAt),
						updatedAt: new Date(msg.updatedAt),
						lastSyncAt: new Date(getCurrentTimestamp()),
						isDeleted: msg.isDeleted
					})
					.onConflictDoUpdate({
						target: messages.id,
						set: {
							conversationId: msg.conversationId,
							role: msg.role,
							content: msg.content,
							model: msg.model,
							provider: msg.provider,
							tokenCount: msg.tokenCount,
							order: msg.order,
							parentMessageId: msg.parentMessageId,
							isStreaming: msg.isStreaming,
							streamCompleted: msg.streamCompleted,
							updatedAt: new Date(msg.updatedAt),
							lastSyncAt: new Date(getCurrentTimestamp()),
							isDeleted: msg.isDeleted
						}
					});
				messagesUpdated++;
			} catch (error) {
				console.error('Failed to sync message:', msg.id, error);
			}
		}

		return {
			success: true,
			conversationsUpdated,
			messagesUpdated
		};
	}

	/**
	 * Force full resync (clear local data and sync everything)
	 */
	async fullResync(): Promise<SyncResult> {
		console.log('🔄 Starting full resync - clearing local data');

		// Clear local data
		await clearAllLocalData();

		// Reset sync timestamp to force full sync
		await updateLastSyncTimestamp(0);

		// Perform sync
		return this.sync();
	}

	/**
	 * Check if sync is currently running
	 */
	get isSyncInProgress(): boolean {
		return this.isSyncing;
	}

	/**
	 * Listen for sync events
	 */
	addEventListener(type: string, listener: EventListener) {
		this.syncEventTarget.addEventListener(type, listener);
	}

	removeEventListener(type: string, listener: EventListener) {
		this.syncEventTarget.removeEventListener(type, listener);
	}

	private dispatchSyncEvent(type: string, detail?: any) {
		this.syncEventTarget.dispatchEvent(new CustomEvent(type, { detail }));
	}
}

// Export singleton instance
export const syncService = new SyncService();
