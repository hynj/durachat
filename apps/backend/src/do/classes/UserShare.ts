import { RpcTarget } from "cloudflare:workers";
import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { Conversation, Message } from "../../db/user/data";
import { 
  getConversation, 
  getConversationMessages
} from "../utils/message-helpers";

export class UserShare extends RpcTarget {
  constructor(
    private db: DrizzleSqliteDODatabase<any>,
    private ctx: DurableObjectState,
    private storage: DurableObjectStorage,
    private env: CloudflareBindings
  ) {
    super();
  }

  async getSharedConversation(uniqueId: string): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    try {
      const shareKey = `share:${uniqueId}`;
      const shareData = await this.storage.get(shareKey) as { conversationId: string; createdAt: number; expiresAt: number } | undefined;
      
      if (!shareData) {
        return null;
      }

      // Check if share link has expired
      if (Date.now() > shareData.expiresAt) {
        // Clean up expired share
        await this.storage.delete(shareKey);
        return null;
      }

      // Get conversation and messages
      const conversation = await getConversation(this.db, shareData.conversationId);
      if (!conversation) {
        return null;
      }

      const messages = await getConversationMessages(this.db, shareData.conversationId);
      
      return {
        conversation,
        messages: messages.filter(msg => !msg.isStreaming) // Only return completed messages
      };
    } catch (error) {
      console.error('Error getting shared conversation:', error);
      return null;
    }
  }
}