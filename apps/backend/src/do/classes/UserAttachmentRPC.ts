import { RpcTarget } from "cloudflare:workers";
import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { attachments, NewAttachment, Attachment } from "../../db/user/data";
import { eq, and, or, isNull } from "drizzle-orm";
import { getLogger } from '../../utils/logger';

export class UserAttachmentRPC extends RpcTarget {
  constructor(
    private db: DrizzleSqliteDODatabase<any>,
    private env: CloudflareBindings
  ) {
    super();
  }

  async createAttachment(attachmentData: NewAttachment): Promise<Attachment> {
    const [attachment] = await this.db.insert(attachments).values(attachmentData).returning();
    return attachment;
  }

  async getMessageAttachments(messageId: string): Promise<Attachment[]> {
    return await this.db.select().from(attachments)
      .where(and(
        eq(attachments.messageId, messageId),
        or(eq(attachments.isDeleted, false), isNull(attachments.isDeleted))
      ));
  }

  async getMessageAttachmentsByConversation(conversationId: string): Promise<Attachment[]> {
    const attachmentList = await this.db.select().from(attachments)
      .where(and(
        eq(attachments.conversationId, conversationId),
        or(eq(attachments.isDeleted, false), isNull(attachments.isDeleted))
      ));
    const logger = getLogger(this.env);
    logger.debug('DATABASE', 'Retrieved attachments by conversation', {
      conversation_id: conversationId,
      attachment_count: attachmentList.length
    });
    return attachmentList;
  }

  async updateAttachment(attachmentId: string, updates: Partial<Pick<Attachment, 'storageUrl' | 'data'>>) {
    const [updated] = await this.db.update(attachments)
      .set(updates)
      .where(eq(attachments.id, attachmentId))
      .returning();
    return updated;
  }

  async getAttachmentData(attachment: Attachment): Promise<string | ArrayBuffer | null> {
    try {
      if (attachment.storageUrl) {
        // Get file from R2 storage
        const r2Object = await this.env.DurachatR2.get(attachment.storageUrl);
        if (!r2Object) {
          const logger = getLogger(this.env);
          logger.error('DATABASE', 'Attachment not found in R2', {
            attachment_id: attachment.id,
            storage_url: attachment.storageUrl
          });
          return null;
        }

        // For images, return raw ArrayBuffer (AI SDK supports this directly)
        if (attachment.mimeType.startsWith('image/')) {
          return await r2Object.arrayBuffer();
        }

        // For text files, return as text
        if (attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/pdf') {
          return await r2Object.text();
        }

        // For other file types, return as ArrayBuffer
        return await r2Object.arrayBuffer();
      }

      if (attachment.data) {
        // Handle blob data stored directly in database
        const arrayBuffer = attachment.data as ArrayBuffer;
        if (attachment.mimeType.startsWith('image/')) {
          return arrayBuffer; // Return raw ArrayBuffer for images
        }
        return new TextDecoder().decode(arrayBuffer);
      }

      return null;
    } catch (error) {
      const logger = getLogger(this.env);
      logger.error('DATABASE', 'Error retrieving attachment data', {
        attachment_id: attachment.id,
        storage_url: attachment.storageUrl,
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.db.update(attachments)
      .set({ 
        isDeleted: true
      })
      .where(eq(attachments.id, attachmentId));
  }

  async getAttachmentById(attachmentId: string): Promise<Attachment | null> {
    const [attachment] = await this.db.select().from(attachments)
      .where(and(
        eq(attachments.id, attachmentId),
        or(eq(attachments.isDeleted, false), isNull(attachments.isDeleted))
      ));
    return attachment || null;
  }
}