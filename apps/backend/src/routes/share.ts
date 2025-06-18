import { Hono } from 'hono';
import { UserChatRPC } from '../do/classes/UserChatRPC';
import { confirmSession } from '../middleware/session';
import { getCookie } from 'hono/cookie';

const share = new Hono<{ Bindings: CloudflareBindings }>();

// Create a share link for a conversation
share.post('/create', async (c) => {
  try {
    // Get user DO instance and attachment RPC
    const sessionToken = getCookie(c, 'session_token');
    const userDOId = getCookie(c, 'user_do_id');
    const { conversationId } = await c.req.json();
    if (!conversationId) {
      return c.json({ error: 'Conversation ID is required' }, 400);
    }

    if (!sessionToken || !userDOId) {
      return c.json({ error: 'Missing session or user ID' }, 400)
    }

    const userDO = c.env.User.get(c.env.User.idFromName(userDOId))

    // Get user DO
    const userRPC = userDO.getChatRPC(sessionToken);

    // Create share link
    const shareData = await userRPC.createShareLink(conversationId);

    return c.json({ shareUrl: `/share?do=${shareData.id}&id=${shareData.uniqueId}` });
  } catch (error) {
    console.error('Error creating share link:', error);
    return c.json({ error: 'Failed to create share link' }, 500);
  }
});

// Get shared conversation data (public endpoint)
share.get('/view', async (c) => {
  try {
    const doId = c.req.query('do');
    const uniqueId = c.req.query('id');

    if (!doId || !uniqueId) {
      return c.json({ error: 'Invalid share link - missing parameters' }, 400);
    }

    // Get user DO using the doId from the share link
    const userDO = c.env.User.get(c.env.User.idFromName(doId));

    // Get share RPC (no session validation needed for public access)
    const shareRPC = await userDO.getShareRPC();

    // Get shared conversation data
    const sharedData = await shareRPC.getSharedConversation(uniqueId);

    if (!sharedData) {
      return c.json({ error: 'Share link not found or expired' }, 404);
    }

    return c.json(sharedData);
  } catch (error) {
    console.error('Error getting shared conversation:', error);
    return c.json({ error: 'Failed to load shared conversation' }, 500);
  }
});

export default share;
