import { Hono } from 'hono'
import * as v from 'valibot'
import { customValibotValidator } from '../validation/valibot-validator'
import { generateText } from 'ai'
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { streamText as honoStreamText } from 'hono/streaming'
import { streamText } from 'ai'
import { ProviderName } from '../providers'
import { getCookie } from 'hono/cookie'
import { confirmSession } from '../middleware/session'
import { getLogger } from '../utils/logger'

const testVal = v.object({
  test: v.string()
})

const switchProviderVal = v.object({
  conversationId: v.string(),
  provider: v.picklist(['google', 'openai', 'anthropic', 'openrouter']),
  model: v.string()
})

const app = new Hono<{ Bindings: CloudflareBindings }>()
  .get('/test', customValibotValidator('query', testVal), (c) => {
    return c.text('Hello Hono!')
  })
  .get('/aio', confirmSession, async (c) => {
    const google = createGoogleGenerativeAI({ apiKey: c.env.GOOGLE_API_KEY });
    const { textStream } = streamText({
      model: google("models/gemini-2.0-flash-exp"),
      prompt: "What is love?",
    })
    c.header('Content-Encoding', 'Identity')

    return honoStreamText(c, async (honoStreamText) => {
      for await (const textPart of textStream) {
        await honoStreamText.write(textPart);
      }

    })

  })
  .get('/chat', confirmSession, async (c) => {
    const google = createGoogleGenerativeAI({ apiKey: c.env.GOOGLE_API_KEY });

    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');

    if (!sessionToken || !userDOId) {
      return c.text('Missing Session', 400);
    }

    const userDOName = c.env.User.idFromName(userDOId)
    const userDO = c.env.User.get(userDOName)
    const chatRPC = await userDO.getChatRPC(sessionToken);

    const conversation = await chatRPC.createConversation({
      title: "AI Chat",
      model: "gemini-2.0-flash-exp",
      provider: "google"
    })
    c.header('Content-Encoding', 'Identity')
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')

    const assistantMessage = await chatRPC.createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "",
      model: "gemini-2.0-flash-exp",
      provider: "google",
      order: 1,
      isStreaming: true,
      streamCompleted: false
    })

    const { textStream } = streamText({
      model: google("models/gemini-2.0-flash-exp"),
      prompt: "What is love?",
    })

    return honoStreamText(c, async (stream) => {
      await stream.write(`data: {"type":"conversation_id","id":"${conversation.id}"}\n\n`)

      for await (const textPart of textStream) {
        await chatRPC.appendToMessage(assistantMessage.id, textPart)
        await stream.write(`data: {"type":"text","content":${JSON.stringify(textPart)}}\n\n`)
      }

      await chatRPC.updateMessage(assistantMessage.id, {
        isStreaming: false,
        streamCompleted: true
      })

      await stream.write(`data: {"type":"done"}\n\n`)
    })
  })
  .get('/chat/:conversationId/catchup', confirmSession, async (c) => {
    const conversationId = c.req.param('conversationId')

    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');

    if (!sessionToken || !userDOId) {
      return c.text('Missing Session', 400);
    }

    const userDOName = c.env.User.idFromName(userDOId)
    const userDO = c.env.User.get(userDOName)
    const chatRPC = await userDO.getChatRPC(sessionToken);

    const conversation = await chatRPC.getConversation(conversationId)
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    const messages = await chatRPC.getConversationMessages(conversationId)
    const streamingMessages = await chatRPC.getStreamingMessages(conversationId)

    return c.json({
      conversation,
      messages,
      hasActiveStream: streamingMessages.length > 0
    })
  })
  .get('/sync', confirmSession, async (c) => {

    try {
      const lastSync = c.req.query('lastSync');
      const lastSyncTimestamp = lastSync ? parseInt(lastSync) : 0;

      const sessionToken = getCookie(c, 'session_token');
      const userDOId = getCookie(c, 'user_do_id');

      if (!sessionToken || !userDOId) {
        return c.text('Missing Session', 400);
      }

      const userDOName = c.env.User.idFromName(userDOId);
      const userDO = c.env.User.get(userDOName);
      const chatRPC = await userDO.getChatRPC(sessionToken);

      // Get all conversations and messages updated after lastSync
      const syncData = await chatRPC.getSyncData(lastSyncTimestamp);

      return c.json({
        conversations: syncData.conversations,
        messages: syncData.messages,
        serverTimestamp: Date.now()
      });
    } catch (error) {
      const logger = getLogger(c.env);
      logger.error('DATABASE', 'Error syncing data', {
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined,
        last_sync_timestamp: lastSyncTimestamp
      });
      return c.json({ error: 'Failed to sync data' }, 500);
    }
  })
  .delete('/clear-all', confirmSession, async (c) => {
    try {
      const sessionToken = getCookie(c, 'session_token');
      const userDOId = getCookie(c, 'user_do_id');

      if (!sessionToken || !userDOId) {
        return c.text('Missing Session', 400);
      }

      const userDOName = c.env.User.idFromName(userDOId)
      const userDO = c.env.User.get(userDOName)
      const chatRPC = await userDO.getChatRPC(sessionToken);

      // Clear all conversations and messages
      await chatRPC.clearAllData();

      return c.json({ success: true, message: 'All conversations and messages deleted' });
    } catch (error) {
      const logger = getLogger(c.env);
      logger.error('DATABASE', 'Error clearing all data', {
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined
      });
      return c.json({ error: 'Failed to clear data' }, 500);
    }
  })
  .post('/switch-provider', customValibotValidator('json', switchProviderVal), async (c) => {
    const { conversationId, provider, model } = c.req.valid('json');

    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');

    if (!sessionToken || !userDOId) {
      console.log('Missing Session');
      return c.text('Missing Session', 400);
    }

    const userDOName = c.env.User.idFromName(userDOId);
    const userDO = c.env.User.get(userDOName);
    const chatRPC = await userDO.getChatRPC(sessionToken);

    try {
      console.log('provider', provider);
      await chatRPC.switchProvider(conversationId, provider as ProviderName, model);
      return c.json({ success: true, message: 'Provider switched successfully' });
    } catch (error) {
      const logger = getLogger(c.env);
      logger.error('PROVIDER', 'Error switching provider', {
        conversation_id: conversationId,
        provider: provider,
        model: model,
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined
      });
      return c.json({ error: 'Failed to switch provider' }, 500);
    }
  })
  .get('/ws', async (c) => {
    const upgradeHeader = c.req.header('upgrade');
    if (upgradeHeader !== 'websocket') {
      return c.text('Expected WebSocket', 400);
    }

    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');

    c.header('X-Session-token', sessionToken)


    if (!sessionToken || !userDOId) {
      return c.text('Invalid Request', 400);
    }

    try {
      const userDOName = c.env.User.idFromName(userDOId)
      const userDO = c.env.User.get(userDOName)


      const newReq = new Request(
        new Request(c.req.raw),
      );
      newReq.headers.set('X-Session-token', sessionToken)


      return userDO.fetch(newReq);
    }
    catch (e) {
      const logger = getLogger(c.env);
      logger.error('WEBSOCKET', 'WebSocket connection error', {
        error_message: e instanceof Error ? e.message : String(e),
        stack_trace: e instanceof Error ? e.stack : undefined
      });
      return c.text('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
  })
  .get('/validatetest', async (c) => {
    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');

    if (!sessionToken || !userDOId) {
      return c.text('Invalid Request', 400);
    }

    try {
      const userDOName = c.env.User.idFromName(userDOId)
      const userDO = c.env.User.get(userDOName)

      const session = await userDO.validateSession(sessionToken)
      if (!session) {
        return c.text('Invalid Session', 400);
      }
      return c.text('Valid Session', 200);
    }
    catch (e) {
      const logger = getLogger(c.env);
      logger.error('AUTH', 'Session validation error', {
        error_message: e instanceof Error ? e.message : String(e),
        stack_trace: e instanceof Error ? e.stack : undefined
      });
      return c.text('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
  })

export default app

