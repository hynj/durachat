import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq, desc, max, isNull, or, and } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
	dbService,
	type Conversation,
	type NewConversation,
	type Message,
	type NewMessage
} from './database';
import { conversations, messages } from 'backend/src/db/user/data';
import { uuidv7 } from 'uuidv7';

// Frontend-only settings table for sync metadata
export const settings = sqliteTable('settings', {
	id: text('id').primaryKey(),
	value: text('value').notNull()
});

// Create a Drizzle instance using SQLocalDrizzle
let drizzleDb: ReturnType<typeof drizzle> | null = null;

// Conversation queries
export async function createConversation(
	data: Partial<NewConversation> & { id?: string }
): Promise<string> {
	const db = await dbService.getDb();

	const conversationId = data.id || uuidv7();
	const now = new Date();

	await db.insert(conversations).values({
		id: conversationId,
		title: data.title || 'New Conversation',
		model: data.model || 'claude-3-sonnet',
		provider: data.provider || 'anthropic',
		systemPrompt: data.systemPrompt || null,
		createdAt: now,
		updatedAt: now
	});

	return conversationId;
}

export async function getConversation(id: string): Promise<Conversation | null> {
	const db = await dbService.getDb();

	const result = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.id, id),
				or(eq(conversations.isDeleted, false), isNull(conversations.isDeleted))
			)
		)
		.limit(1);

	return result[0] || null;
}

export async function getRecentConversations(limit = 10): Promise<Conversation[]> {
	const db = await dbService.getDb();

	const result = await db
		.select()
		.from(conversations)
		.where(or(eq(conversations.isDeleted, false), isNull(conversations.isDeleted)))
		.orderBy(desc(conversations.updatedAt))
		.limit(limit);

	return result;
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
	const db = await dbService.getDb();

	await db
		.update(conversations)
		.set({
			title,
			updatedAt: new Date()
		})
		.where(eq(conversations.id, id));
}

export async function updateConversationTimestamp(id: string): Promise<void> {
	const db = await dbService.getDb();

	await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));
}

export async function deleteConversation(id: string): Promise<void> {
	const db = await dbService.getDb();

	// Soft delete locally
	await db
		.update(conversations)
		.set({
			isDeleted: true,
			updatedAt: new Date()
		})
		.where(eq(conversations.id, id));
}

// Message queries
export async function createMessage(data: Partial<NewMessage>): Promise<string> {
	const db = await dbService.getDb();

	const messageId = uuidv7();
	const now = new Date();

	// Get the next order number for this conversation
	const orderResult = await db
		.select({ nextOrder: max(messages.order) })
		.from(messages)
		.where(eq(messages.conversationId, data.conversationId!));

	const nextOrder = (orderResult[0]?.nextOrder || -1) + 1;

	await db.insert(messages).values({
		id: messageId,
		conversationId: data.conversationId!,
		role: data.role!,
		content: data.content || '',
		model: data.model || null,
		provider: data.provider || null,
		order: nextOrder,
		isStreaming: data.isStreaming || false,
		streamCompleted: data.streamCompleted !== false,
		createdAt: now,
		updatedAt: now
	});

	// Update conversation timestamp
	await updateConversationTimestamp(data.conversationId!);

	return messageId;
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
	const db = await dbService.getDb();

	const result = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.conversationId, conversationId),
				or(eq(messages.isDeleted, false), isNull(messages.isDeleted))
			)
		)
		.orderBy(messages.order);

	return result;
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
	const db = await dbService.getDb();

	const updateData: any = { updatedAt: new Date() };

	if (updates.content !== undefined) updateData.content = updates.content;
	if (updates.isStreaming !== undefined) updateData.isStreaming = updates.isStreaming;
	if (updates.streamCompleted !== undefined) updateData.streamCompleted = updates.streamCompleted;

	await db.update(messages).set(updateData).where(eq(messages.id, id));
}

export async function appendToMessage(id: string, content: string): Promise<void> {
	const db = await dbService.getDb();

	// For append operation, we need raw SQL since Drizzle doesn't have concat
	await db.run(`
    UPDATE messages 
    SET content = content || ${content}, updated_at = ${Date.now()}
    WHERE id = ${id}
  `);
}

// Generate conversation title from first message
export async function generateConversationTitle(conversationId: string): Promise<string> {
	const messageList = await getConversationMessages(conversationId);
	const firstUserMessage = messageList.find((m) => m.role === 'user');

	if (!firstUserMessage) return 'New Conversation';

	// Create a title from the first user message (first 50 chars)
	const title = firstUserMessage.content.slice(0, 50).trim();
	return title + (firstUserMessage.content.length > 50 ? '...' : '');
}

// Clear all local data
export async function clearAllLocalData(): Promise<void> {
	const db = await dbService.getDb();
	console.log('🗑️ Clearing all conversations and messages from local SQLite database');

	// Delete all messages first (due to foreign key constraints)
	await db.delete(messages);

	// Delete all conversations
	await db.delete(conversations);

	console.log('✅ Local SQLite database cleared');
}
