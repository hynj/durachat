import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { uuidv7 } from 'uuidv7'
import { confirmSession } from '../middleware/session'
import { getCookie } from 'hono/cookie'
import { getLogger } from '../utils/logger'

const app = new Hono<{Bindings: CloudflareBindings}>()

app.use(confirmSession)

app.post('/', async (c) => {
  
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const conversationId = formData.get('conversationId') as string
    const messageId = formData.get('messageId') as string | null

    if (!file || !conversationId) {
      return c.json({ error: 'Missing required fields: file, conversationId' }, 400)
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return c.json({ error: 'File size exceeds 10MB limit' }, 400)
    }

    // Generate unique file key for R2
    const fileId = uuidv7()
    const fileExtension = file.name.split('.').pop() || ''
    const r2Key = `attachments/${conversationId}/${fileId}.${fileExtension}`

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer()
    await c.env.DurachatR2.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    })

    // Get user DO instance and attachment RPC
    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');

    if (!sessionToken || !userDOId) {
      return c.json({ error: 'Missing session or user ID' }, 400)
    }

    const userDO = c.env.User.get(c.env.User.idFromName(userDOId))
    const attachmentRPC = await userDO.getAttachmentRPC(sessionToken);

    // Create attachment record with R2 URL
    const attachmentData = {
      messageId,
      fileName: file.name,
      fileType: fileExtension,
      fileSize: file.size,
      mimeType: file.type,
      storageUrl: r2Key,
      conversationId: conversationId
    }

    const attachment = await attachmentRPC.createAttachment(attachmentData)
    const logger = getLogger(c.env);
    logger.debug('DATABASE', 'Attachment created', {
      attachment_id: attachment.id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      conversation_id: conversationId
    });

    return c.json({
      id: attachment.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      storageUrl: attachment.storageUrl,
      messageId: attachment.messageId,
      conversationId: attachment.conversationId,
      createdAt: attachment.createdAt
    })

  } catch (error) {
    const logger = getLogger(c.env);
    logger.error('DATABASE', 'Attachment upload error', {
      error_message: error instanceof Error ? error.message : String(error),
      stack_trace: error instanceof Error ? error.stack : undefined
    });
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
