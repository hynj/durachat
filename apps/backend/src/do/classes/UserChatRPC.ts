import { RpcTarget } from "cloudflare:workers";
import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { ProviderName, AIProviderFactory } from '../../providers';
import { MessageContent } from '../../providers/types';
import { Conversation, Message, Attachment, conversations, userSettings } from "../../db/user/data";
import { eq } from "drizzle-orm";
import { 
  createConversation, 
  getConversation, 
  updateConversationTitle,
  getConversationMessages,
  createMessage,
  getStreamingMessages,
  getSyncData,
  clearAllData,
  getMessageAttachmentsByConversation,
  createUsage
} from "../utils/message-helpers";
import { CreditManager } from "../../utils/credit-manager";
import { 
  broadcastToConversation,
  getSessionIdFromWebSocket,
  getConversationIdFromWebSocket,
  updateMessageContent,
  appendToMessageContent
} from "../utils/streaming-helpers";
import { getApiKeyForProvider } from "../utils/provider-helpers";
import { getLogger } from '../../utils/logger';

export class UserChatRPC extends RpcTarget {
  constructor(
    private db: DrizzleSqliteDODatabase<any>,
    private ctx: DurableObjectState,
    private storage: DurableObjectStorage,
    private env: CloudflareBindings
  ) {
    super();
  }

  async createConversation(conversationData: Parameters<typeof createConversation>[1]) {
    return createConversation(this.db, conversationData);
  }

  async getConversation(conversationId: string) {
    return getConversation(this.db, conversationId);
  }

  async updateConversationTitle(conversationId: string, title: string) {
    return updateConversationTitle(this.db, conversationId, title);
  }

  async switchProvider(conversationId: string, provider: ProviderName, model: string): Promise<void> {
    const logger = getLogger(this.env);
    logger.debug('PROVIDER', 'switchProvider called', {
      conversation_id: conversationId,
      provider: provider,
      model: model
    });

    const providerFactory = AIProviderFactory.getInstance();

    if (!providerFactory.getSupportedProviders().includes(provider)) {
      logger.error('PROVIDER', 'Unsupported provider', {
        provider: provider,
        supported_providers: providerFactory.getSupportedProviders()
      });
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const supportedModels = providerFactory.getProviderModels(provider);
    if (!supportedModels.includes(model)) {
      logger.error('PROVIDER', 'Unsupported model', {
        model: model,
        provider: provider,
        supported_models: supportedModels
      });
      throw new Error(`Unsupported model ${model} for provider ${provider}`);
    }

    try {
      // Get user settings for API key resolution
      const userSettingsResult = await this.db.select().from(userSettings).limit(1);
      const userSettingsData = userSettingsResult[0];

      console.debug("userSettingsData ", userSettingsData);
      
      // Get the actual user ID from storage
      const storedUserID = await this.storage.get('userID');
      
      // Create user context for API key resolution
      const userContext = userSettingsData && storedUserID ? {
        id: storedUserID,
        credits: userSettingsData.balanceInOneHundreths / 100
      } : undefined;
      
      await getApiKeyForProvider(this.env, provider, userContext, userSettingsData);
    } catch (error) {
      throw new Error(`API key not configured for provider: ${provider}`);
    }

    let existingConversation = await getConversation(this.db, conversationId);
    
    // If conversation doesn't exist, create it with the new provider/model
    if (!existingConversation) {
      logger.info('PROVIDER', 'Creating new conversation with provider', {
        conversation_id: conversationId,
        provider: provider,
        model: model
      });
      
      existingConversation = await createConversation(this.db, {
        id: conversationId,
        title: '...',
        provider,
        model,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Update existing conversation
      const updateResult = await this.db
        .update(conversations)
        .set({
          provider,
          model,
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId))
        .returning();

      if (updateResult.length === 0) {
        throw new Error('Conversation not found or could not be updated');
      }
    }
  }

  async getSyncData(lastSyncTimestamp: number) {
    const logger = getLogger(this.env);
    logger.debug('SYNC', 'Getting sync data', {
      last_sync_timestamp: lastSyncTimestamp,
      last_sync_date: new Date(lastSyncTimestamp).toISOString()
    });
    
    const result = getSyncData(this.db, lastSyncTimestamp);
    const syncData = await result;
    
    logger.debug('SYNC', 'Sync data retrieved', {
      conversation_count: syncData.conversations.length,
      message_count: syncData.messages.length
    });
    
    return syncData;
  }

  async clearAllData() {
    const logger = getLogger(this.env);
    logger.info('DATABASE', 'Clearing all conversations and messages from backend database');
    await clearAllData(this.db);
    logger.info('DATABASE', 'Backend database tables cleared');
  }

  async getConversationMessages(conversationId: string) {
    return getConversationMessages(this.db, conversationId);
  }

  async createMessage(messageData: Parameters<typeof createMessage>[1]) {
    return createMessage(this.db, messageData);
  }

  async updateMessage(messageId: string, updates: Parameters<typeof updateMessageContent>[2]) {
    return updateMessageContent(this.db, messageId, updates);
  }

  async appendToMessage(messageId: string, textChunk: string) {
    return appendToMessageContent(this.db, messageId, textChunk);
  }

  async getStreamingMessages(conversationId: string) {
    return getStreamingMessages(this.db, conversationId);
  }

  async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}`;

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const tags = [`sessionId:${sessionId}`];
    if (conversationId && conversationId !== 'null') {
      tags.push(`conversationId:${conversationId}`);
    }

    this.ctx.acceptWebSocket(server, tags);

    if (conversationId) {
      await this.sendCatchUp(server, conversationId);
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message);
      const sessionId = getSessionIdFromWebSocket(this.ctx, ws);

      if (!sessionId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }

      switch (data.type) {
        case 'start_chat':
          await this.startChat(ws, sessionId, data.prompt || "What is love?", data.conversationId, data.messageId, data.provider, data.model, data.reasoningEffort);
          break;
        case 'switch_conversation':
          await this.switchConversation(ws, sessionId, data.conversationId);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Cleanup is automatically handled by hibernatable websockets
  }

  async sendCatchUp(ws: WebSocket, conversationId: string) {
    const conversation = await getConversation(this.db, conversationId);
    if (!conversation) {
      ws.send(JSON.stringify({ type: 'error', message: 'Conversation not found' }));
      return;
    }

    const messages = await getConversationMessages(this.db, conversationId);
    const streamingMessages = await getStreamingMessages(this.db, conversationId);

    ws.send(JSON.stringify({
      type: 'catchup',
      conversation,
      messages,
      hasActiveStream: streamingMessages.length > 0
    }));
  }

  async switchConversation(ws: WebSocket, sessionId: string, conversationId: string | null) {
    const logger = getLogger(this.env);
    try {
      logger.debug('WEBSOCKET', 'Backend switchConversation called', {
        conversation_id: conversationId,
        session_id: sessionId
      });

      // Update WebSocket tags to reflect new conversation
      const currentTags = this.ctx.getTags(ws);
      const newTags = currentTags.filter(tag => !tag.startsWith('conversationId:'));
      newTags.push(`sessionId:${sessionId}`); // Ensure session tag is present
      
      if (conversationId && conversationId !== 'null') {
        newTags.push(`conversationId:${conversationId}`);
        // Update session storage
        await this.storage.put(`session:${sessionId}:conversation`, conversationId);
      } else {
        // Remove conversation from session storage if switching to null
        await this.storage.delete(`session:${sessionId}:conversation`);
      }
      
      // Apply new tags to WebSocket
      this.ctx.setWebSocketTags(ws, newTags);

      if (!conversationId) {
        ws.send(JSON.stringify({
          type: 'conversation_switched',
          conversationId: null,
          conversation: null,
          messages: [],
          hasActiveStream: false
        }));
        return;
      }

      const conversation = await getConversation(this.db, conversationId);
      if (!conversation) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Conversation not found'
        }));
        return;
      }

      const messages = await getConversationMessages(this.db, conversationId);
      const streamingMessages = await getStreamingMessages(this.db, conversationId);

      ws.send(JSON.stringify({
        type: 'conversation_switched',
        conversationId: conversationId,
        conversation,
        messages,
        hasActiveStream: streamingMessages.length > 0
      }));

    } catch (error) {
      logger.error('WEBSOCKET', 'Error switching conversation', {
        conversation_id: conversationId,
        session_id: sessionId,
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined
      });
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to switch conversation'
      }));
    }
  }

  async startChat(ws: WebSocket, sessionId: string, prompt: string, messageConversationId?: string, messageId?: string, messageProvider?: string, messageModel?: string, reasoningEffort?: string) {
    try {
      let conversationId = messageConversationId || getConversationIdFromWebSocket(this.ctx, ws);
      let conversation;
      let isNewConversation = false;

      if (!conversationId) {
        const storedConversationId = await this.storage.get(`session:${sessionId}:conversation`);
        if (storedConversationId && typeof storedConversationId === 'string') {
          conversationId = storedConversationId;
          conversation = await getConversation(this.db, conversationId);
        }
      } else {
        conversation = await getConversation(this.db, conversationId);
      }

      if (!conversation) {
        const logger = getLogger(this.env);
        logger.debug('DATABASE', 'Creating conversation with provider/model', {
          provider: messageProvider,
          model: messageModel,
          session_id: sessionId
        });
        const conversationData: any = {
          title: "...",
          model: messageModel || "claude-sonnet-4-20250514",
          provider: messageProvider || "anthropic"
        };

        if (conversationId) {
          conversationData.id = conversationId;
        }

        conversation = await createConversation(this.db, conversationData);
        await this.storage.put(`session:${sessionId}:conversation`, conversation.id);
        isNewConversation = true;
      }

      const existingMessages = await getConversationMessages(this.db, conversation.id);
      const nextOrder = existingMessages.length;

      const userMessageData: any = {
        conversationId: conversation.id,
        role: "user",
        content: prompt,
        order: nextOrder
      };

      if (messageId) {
        userMessageData.id = messageId;
      }

      await createMessage(this.db, userMessageData);

      if (nextOrder === 0 && (conversation.title === "..." || conversation.title === "New Chat")) {
        const title = prompt.slice(0, 50).trim() + (prompt.length > 50 ? '...' : '');
        await updateConversationTitle(this.db, conversation.id, title);
        conversation.title = title;

        ws.send(JSON.stringify({
          type: 'conversation_updated',
          conversation: conversation
        }));
      }

      const logger = getLogger(this.env);
      logger.debug('PROVIDER', 'Creating assistant message with conversation data', {
        conversation_id: conversation.id,
        conversation_model: conversation.model,
        conversation_provider: conversation.provider,
        final_model: conversation.model || 'gemini-2.5-flash-preview-05-20',
        final_provider: conversation.provider || 'google'
      });

      const assistantMessage = await createMessage(this.db, {
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        model: conversation.model || 'gemini-2.5-flash-preview-05-20',
        provider: conversation.provider || 'google',
        order: nextOrder + 1,
        isStreaming: true,
        streamCompleted: false
      });

      if (isNewConversation) {
        ws.send(JSON.stringify({
          type: 'conversation_created',
          conversationId: conversation.id,
          messageId: assistantMessage.id
        }));
      }

      const userMessageEvent = {
        type: 'new_message',
        message: {
          id: `user-msg-${nextOrder}`,
          role: 'user',
          content: prompt,
          order: nextOrder
        }
      };
      ws.send(JSON.stringify(userMessageEvent));
      await broadcastToConversation(this.ctx, this.storage, conversation.id, userMessageEvent, ws);

      const assistantMessageEvent = {
        type: 'new_message',
        message: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          order: assistantMessage.order,
          model: assistantMessage.model,
          provider: assistantMessage.provider,
          streaming: true
        }
      };
      ws.send(JSON.stringify(assistantMessageEvent));
      await broadcastToConversation(this.ctx, this.storage, conversation.id, assistantMessageEvent, ws);

      await this.streamResponse(ws, assistantMessage.id, prompt, conversation.id, reasoningEffort);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      ws.send(JSON.stringify({ type: 'error', message: errorMessage }));
    }
  }

  async streamResponse(ws: WebSocket, messageId: string, prompt: string, conversationId: string, reasoningEffort?: string) {
    try {
      const conversation = await getConversation(this.db, conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const providerName = (conversation.provider || 'google') as ProviderName;
      const model = conversation.model || 'gemini-2.5-flash-preview-05-20';
      
      // Get user settings for API key resolution
      const userSettingsResult = await this.db.select().from(userSettings).limit(1);
      const userSettingsData = userSettingsResult[0];
      
      // Get the actual user ID from storage
      const storedUserID = await this.storage.get('userID');
      
      // Create user context for API key resolution
      const userContext = userSettingsData && storedUserID ? {
        id: storedUserID,
        credits: userSettingsData.balanceInOneHundreths / 100 // Convert to credits
      } : undefined;
      
      const keyResult = await getApiKeyForProvider(this.env, providerName, userContext, userSettingsData);
      const apiKey = keyResult.apiKey;
      
      // Check if user has sufficient credits when using system API keys
      if (!keyResult.isUserKey && userSettingsData && storedUserID) {
        const creditManager = new CreditManager(this.db, this.env);
        const currentBalance = userSettingsData.balanceInOneHundreths;
        
        // Rough estimate for pre-flight check (will be recalculated with actual usage)
        const estimatedCostInCents = 5; // 5 cents minimum estimate
        
        if (currentBalance < estimatedCostInCents) {
          throw new Error(`Insufficient credits. You have ${(currentBalance/100).toFixed(2)} credits but need at least ${(estimatedCostInCents/100).toFixed(2)} credits to start this conversation.`);
        }
      }

      const providerFactory = AIProviderFactory.getInstance();
      const provider = providerFactory.createProvider(providerName, {
        apiKey,
        model
      });

      const conversationMessages = await getConversationMessages(this.db, conversationId);
      const conversationAttachments = await getMessageAttachmentsByConversation(this.db, conversationId);

      const userMessages = conversationMessages.filter(msg => msg.role === 'user' && msg.id !== messageId);
      const mostRecentUserMessage = userMessages[userMessages.length - 1];

      const aiMessages = await Promise.all(conversationMessages
        .filter(msg => msg.id !== messageId)
        .map(async (msg) => {
          let content: string | MessageContent[] = msg.content;

          if (msg.role === 'user' && msg.id === mostRecentUserMessage?.id && conversationAttachments.length > 0) {
            const supportedAttachments: Attachment[] = [];
            for (const attachment of conversationAttachments) {
              if (attachment.fileSize > 10 * 1024 * 1024) {
                continue;
              }
              if (providerFactory.supportsAttachmentType(providerName, attachment.mimeType)) {
                supportedAttachments.push(attachment);
              }
            }

            if (supportedAttachments.length > 0) {
              const contentParts: MessageContent[] = [
                { type: 'text', text: msg.content }
              ];

              for (const attachment of supportedAttachments) {
                try {
                  const attachmentData = await this.getAttachmentData(attachment);
                  if (attachmentData) {
                    if (attachment.mimeType.startsWith('image/')) {
                      contentParts.push({
                        type: 'image',
                        image: attachmentData
                      });
                    } else {
                      contentParts[0].text += `\n\n[File: ${attachment.fileName}]\n${attachmentData}`;
                    }
                  }
                } catch (error) {
                  console.error(`❌ Error processing attachment ${attachment.fileName}:`, error);
                }
              }
              content = contentParts;
            }
          }

          return {
            role: msg.role as 'user' | 'assistant' | 'system',
            content: content
          };
        }));

      let thinkingContent = '';
      let fullContent = '';
      let buffer = '';
      let bufferCount = 0;
      let reasoningBuffer = '';
      let reasoningBufferCount = 0;
      let reasoningWSBuffer = '';
      let reasoningWSBufferCount = 0;
      const BATCH_SIZE = 5;
      const REASONING_WS_BATCH_SIZE = 10;

      const isGoogleProvider = providerName === 'google';
      const reasoningBatchSize = isGoogleProvider ? 1 : REASONING_WS_BATCH_SIZE;

      const textStream = provider.streamText({
        messages: aiMessages,
        reasoningEffort: reasoningEffort,
        onComplete: async (fullText, usageInfo) => {
          if (usageInfo) {
            try {
              await createUsage(this.db, {
                messageId,
                conversationId,
                model,
                provider: providerName,
                promptTokens: usageInfo.promptTokens,
                completionTokens: usageInfo.completionTokens,
                totalTokens: usageInfo.totalTokens,
                cost: usageInfo.cost
              });
              
              // Deduct credits if using system API key
              if (!keyResult.isUserKey && userSettingsData && storedUserID) {
                const creditManager = new CreditManager(this.db, this.env);
                const usageCost = creditManager.calculateUsageCost(providerName, model, usageInfo, keyResult.isUserKey);
                
                // Update user balance - deduct the cost with 5% markup
                const newBalance = userSettingsData.balanceInOneHundreths - usageCost.costInCents;
                
                if (newBalance >= 0) {
                  await this.db.update(userSettings).set({
                    balanceInOneHundreths: newBalance
                  });
                  
                  // Update local reference for consistency
                  userSettingsData.balanceInOneHundreths = newBalance;
                } else {
                  console.error('❌ Insufficient credits for usage deduction:', {
                    required: usageCost.costInCents,
                    available: userSettingsData.balanceInOneHundreths,
                    userId: storedUserID
                  });
                }
              }
              
              // Send usage data in done event
              ws.send(JSON.stringify({ 
                type: 'done', 
                messageId,
                usage: usageInfo 
              }));
              await broadcastToConversation(this.ctx, this.storage, conversationId, {
                type: 'done',
                messageId: messageId,
                usage: usageInfo
              }, ws);
            } catch (error) {
              console.error('❌ Failed to record usage:', error);
              // Still send done event without usage
              ws.send(JSON.stringify({ type: 'done', messageId }));
              await broadcastToConversation(this.ctx, this.storage, conversationId, {
                type: 'done',
                messageId: messageId
              }, ws);
            }
          } else {
            // No usage info available, send regular done event
            ws.send(JSON.stringify({ type: 'done', messageId }));
            await broadcastToConversation(this.ctx, this.storage, conversationId, {
              type: 'done',
              messageId: messageId
            }, ws);
          }
        },
        onThinkingStart: () => {
          ws.send(JSON.stringify({ type: 'thinking_start', messageId }));
          broadcastToConversation(this.ctx, this.storage, conversationId, {
            type: 'thinking_start',
            messageId: messageId
          }, ws);
        },
        onThinkingToken: (token: string) => {
          thinkingContent += token;
          reasoningBuffer += token;
          reasoningBufferCount++;
          reasoningWSBuffer += token;
          reasoningWSBufferCount++;

          if (reasoningWSBufferCount >= reasoningBatchSize) {
            ws.send(JSON.stringify({ type: 'thinking', content: reasoningWSBuffer, messageId }));
            broadcastToConversation(this.ctx, this.storage, conversationId, {
              type: 'thinking',
              content: reasoningWSBuffer,
              messageId: messageId
            }, ws);
            reasoningWSBuffer = '';
            reasoningWSBufferCount = 0;
          }

          if (reasoningBufferCount >= BATCH_SIZE) {
            this.updateMessage(messageId, { reasoningContent: thinkingContent });
            reasoningBuffer = '';
            reasoningBufferCount = 0;
          }
        },
        onThinkingEnd: () => {
          if (reasoningWSBuffer) {
            ws.send(JSON.stringify({ type: 'thinking', content: reasoningWSBuffer, messageId }));
            broadcastToConversation(this.ctx, this.storage, conversationId, {
              type: 'thinking',
              content: reasoningWSBuffer,
              messageId: messageId
            }, ws);
            reasoningWSBuffer = '';
            reasoningWSBufferCount = 0;
          }

          if (reasoningBuffer) {
            this.updateMessage(messageId, { reasoningContent: thinkingContent });
            reasoningBuffer = '';
            reasoningBufferCount = 0;
          }

          ws.send(JSON.stringify({ type: 'thinking_end', messageId }));
          broadcastToConversation(this.ctx, this.storage, conversationId, {
            type: 'thinking_end',
            messageId: messageId
          }, ws);
        },
        onResponseStart: () => {
          ws.send(JSON.stringify({ type: 'response_start', messageId }));
          broadcastToConversation(this.ctx, this.storage, conversationId, {
            type: 'response_start',
            messageId: messageId
          }, ws);
        }
      });

      for await (const textPart of textStream) {
        fullContent += textPart;
        buffer += textPart;
        bufferCount++;

        ws.send(JSON.stringify({ type: 'text', content: textPart }));
        await broadcastToConversation(this.ctx, this.storage, conversationId, {
          type: 'text',
          content: textPart,
          messageId: messageId
        }, ws);

        if (bufferCount >= BATCH_SIZE) {
          await this.updateMessage(messageId, { content: fullContent });
          buffer = '';
          bufferCount = 0;
        }
      }

      if (buffer) {
        await this.updateMessage(messageId, { content: fullContent });
      }

      await this.updateMessage(messageId, {
        content: fullContent,
        isStreaming: false,
        streamCompleted: true
      });

      // Note: done event is now sent from onComplete callback with usage data

    } catch (error) {
      console.error('❌ Debug: Streaming error:', error);
      await this.updateMessage(messageId, {
        isStreaming: false,
        streamCompleted: false
      });
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      ws.send(JSON.stringify({ type: 'error', message: errorMessage }));
    }
  }

  async getAttachmentData(attachment: Attachment): Promise<string | ArrayBuffer | null> {
    try {
      if (attachment.storageUrl) {
        const r2Object = await this.env.DurachatR2.get(attachment.storageUrl);
        if (!r2Object) {
          console.error('Attachment not found in R2:', attachment.storageUrl);
          return null;
        }

        if (attachment.mimeType.startsWith('image/')) {
          return await r2Object.arrayBuffer();
        }

        if (attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/pdf') {
          return await r2Object.text();
        }

        return await r2Object.arrayBuffer();
      }

      if (attachment.data) {
        const arrayBuffer = attachment.data as ArrayBuffer;
        if (attachment.mimeType.startsWith('image/')) {
          return arrayBuffer;
        }
        return new TextDecoder().decode(arrayBuffer);
      }

      return null;
    } catch (error) {
      console.error('Error retrieving attachment data:', error);
      return null;
    }
  }

  async createShareLink(conversationId: string): Promise<{ uniqueId: string, id: string | undefined }> {
    try {
      // Check if conversation exists
      const conversation = await getConversation(this.db, conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Generate unique share ID
      const uniqueId = crypto.randomUUID();
      const shareKey = `share:${uniqueId}`;
      
      // Store share data in DO storage
      const shareData = {
        conversationId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days from now
      };
      
      await this.storage.put(shareKey, shareData);
      
      return { uniqueId, id: await this.storage.get('userID') };
    } catch (error) {
      console.error('Error creating share link:', error);
      throw error;
    }
  }

}
