import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { conversations, messages, attachments, usage, NewConversation, NewMessage, NewUsage, Conversation, Message, Attachment, Usage } from "../../db/user/data";
import { eq, desc, and, gt, or, isNull } from "drizzle-orm";

export async function createConversation(
  db: DrizzleSqliteDODatabase<any>,
  conversationData: Partial<NewConversation> & { title: string; model: string; provider: string }
): Promise<Conversation> {
  const [conversation] = await db.insert(conversations).values(conversationData).returning();
  return conversation;
}

export async function getConversation(
  db: DrizzleSqliteDODatabase<any>,
  conversationId: string
): Promise<Conversation | null> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  return conversation || null;
}

export async function updateConversationTitle(
  db: DrizzleSqliteDODatabase<any>,
  conversationId: string,
  title: string
): Promise<void> {
  await db
    .update(conversations)
    .set({
      title,
      updatedAt: new Date()
    })
    .where(eq(conversations.id, conversationId));
}

export async function getConversationMessages(
  db: DrizzleSqliteDODatabase<any>,
  conversationId: string
): Promise<(Message & { usage?: Usage })[]> {
  const messageList = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.order);
  
  // Get usage data for all messages
  const messagesWithUsage = await Promise.all(messageList.map(async (message) => {
    const usageRecord = await getMessageUsage(db, message.id);
    return {
      ...message,
      usage: usageRecord || undefined
    };
  }));
  
  return messagesWithUsage;
}

export async function createMessage(
  db: DrizzleSqliteDODatabase<any>,
  messageData: Omit<NewMessage, 'id'> | NewMessage
): Promise<Message> {
  const [message] = await db.insert(messages).values(messageData).returning();
  return message;
}

export async function getStreamingMessages(
  db: DrizzleSqliteDODatabase<any>,
  conversationId: string
): Promise<Message[]> {
  return await db.select().from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.isStreaming, true)
    ))
    .orderBy(desc(messages.createdAt));
}

export async function getSyncData(
  db: DrizzleSqliteDODatabase<any>,
  lastSyncTimestamp: number
): Promise<{
  conversations: Conversation[];
  messages: Message[];
}> {
  const lastSyncDate = new Date(lastSyncTimestamp);

  const updatedConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        gt(conversations.updatedAt, lastSyncDate),
        or(eq(conversations.isDeleted, false), isNull(conversations.isDeleted))
      )
    )
    .orderBy(conversations.updatedAt);

  const updatedMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        gt(messages.updatedAt, lastSyncDate),
        or(eq(messages.isDeleted, false), isNull(messages.isDeleted))
      )
    )
    .orderBy(messages.conversationId, messages.order);

  return {
    conversations: updatedConversations,
    messages: updatedMessages
  };
}

export async function clearAllData(db: DrizzleSqliteDODatabase<any>) {
  await db.delete(messages);
  await db.delete(conversations);
}

export async function getMessageAttachmentsByConversation(
  db: DrizzleSqliteDODatabase<any>,
  conversationId: string
): Promise<Attachment[]> {
  const attachmentList = await db.select().from(attachments)
    .where(and(
      eq(attachments.conversationId, conversationId),
      or(eq(attachments.isDeleted, false), isNull(attachments.isDeleted))
    ));
  return attachmentList;
}

export async function createUsage(
  db: DrizzleSqliteDODatabase<any>,
  usageData: Omit<NewUsage, 'id'> | NewUsage
): Promise<Usage> {
  const [usageRecord] = await db.insert(usage).values(usageData).returning();
  return usageRecord;
}

export async function getMessageUsage(
  db: DrizzleSqliteDODatabase<any>,
  messageId: string
): Promise<Usage | null> {
  const [usageRecord] = await db.select().from(usage).where(eq(usage.messageId, messageId));
  return usageRecord || null;
}

export async function getConversationUsage(
  db: DrizzleSqliteDODatabase<any>,
  conversationId: string
): Promise<Usage[]> {
  return await db.select().from(usage)
    .where(eq(usage.conversationId, conversationId))
    .orderBy(desc(usage.createdAt));
}