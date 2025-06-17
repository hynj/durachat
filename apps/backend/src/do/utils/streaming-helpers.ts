import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { messages } from "../../db/user/data";
import { eq } from "drizzle-orm";

export async function broadcastToConversation(
  ctx: DurableObjectState,
  storage: DurableObjectStorage,
  conversationId: string,
  message: any,
  excludeWebSocket?: WebSocket
) {
  const websockets = await getWebSocketsForConversation(ctx, storage, conversationId);

  for (const ws of websockets) {
    if (excludeWebSocket && ws === excludeWebSocket) continue;

    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message to websocket:', error);
    }
  }
}

export async function getWebSocketsForConversation(
  ctx: DurableObjectState,
  storage: DurableObjectStorage,
  conversationId: string
): Promise<WebSocket[]> {
  const websockets = ctx.getWebSockets();
  const result: WebSocket[] = [];

  for (const ws of websockets) {
    const tags = ctx.getTags(ws);

    if (tags.some(tag => tag === `conversationId:${conversationId}`)) {
      result.push(ws);
      continue;
    }

    const sessionTag = tags.find(tag => tag.startsWith('sessionId:'));
    if (sessionTag) {
      const sessionId = sessionTag.split(':')[1];
      const storedConversationId = await storage.get(`session:${sessionId}:conversation`);
      if (storedConversationId === conversationId) {
        result.push(ws);
      }
    }
  }

  return result;
}

export function getSessionIdFromWebSocket(ctx: DurableObjectState, ws: WebSocket): string | null {
  const websockets = ctx.getWebSockets();
  for (const wsInfo of websockets) {
    if (wsInfo === ws) {
      const tags = ctx.getTags(ws);
      const sessionTag = tags.find(tag => tag.startsWith('sessionId:'));
      return sessionTag ? sessionTag.split(':')[1] : null;
    }
  }
  return null;
}

export function getConversationIdFromWebSocket(ctx: DurableObjectState, ws: WebSocket): string | null {
  const tags = ctx.getTags(ws);
  const conversationTag = tags.find(tag => tag.startsWith('conversationId:'));
  if (conversationTag && conversationTag !== 'conversationId:null') {
    return conversationTag.split(':')[1];
  }
  return null;
}

export async function updateMessageContent(
  db: DrizzleSqliteDODatabase<any>,
  messageId: string,
  updates: Partial<Pick<typeof messages.$inferSelect, 'content' | 'reasoningContent' | 'isStreaming' | 'streamCompleted'>>
) {
  const [updated] = await db.update(messages)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(messages.id, messageId))
    .returning();
  return updated;
}

export async function appendToMessageContent(
  db: DrizzleSqliteDODatabase<any>,
  messageId: string,
  textChunk: string
) {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!message) throw new Error('Message not found');

  const updatedContent = message.content + textChunk;
  await updateMessageContent(db, messageId, { content: updatedContent });
  return updatedContent;
}