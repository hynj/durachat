import { Hono } from 'hono';
import * as v from 'valibot';
import { vValidator } from '@hono/valibot-validator';
import { getLogger } from '../utils/logger';
import { confirmSession, EnvExtendedUserSettings, returnUserSettings } from '../middleware/session';
import { getRegion } from '../utils/do-helpers';
import { getCookie } from 'hono/cookie';

// Validation schemas
const UpdateUserSettingsSchema = v.object({
  apiKeys: v.optional(v.record(v.string(), v.string())),
  preferences: v.optional(v.object({
    defaultModel: v.optional(v.string()),
    defaultProvider: v.optional(v.string()),
    theme: v.optional(v.string())
  }))
});

const userSettingsRoutes = new Hono<EnvExtendedUserSettings>()
  .get('/', returnUserSettings, async (c) => {
    const logger = getLogger(c.env);

    try {
      const userSettings = await c.var.UserSettings;
      const settings = await userSettings.getCurrentSettings();
      
      // Get user ID from cookie to fetch keyLogin
      const userDOId = getCookie(c, 'user_do_id');
      
      let keyLogin = null;
      if (userDOId) {
        try {
          // Find region and get Control DO
          const continent: string | null = c.req.raw.cf?.continent as any;
          const region = getRegion(continent);
          const controlDOId = c.env.Control.idFromName(region);
          const controlDO = c.env.Control.get(controlDOId);
          
          // Get keyLogin for this user (only for non-OAuth users)
          const userKeyLogin = await controlDO.getUserKeyLoginById(userDOId);
          // Only return keyLogin for guest users (those without OAuth providers)
          keyLogin = (userKeyLogin && !userKeyLogin.oAuthProvider) ? userKeyLogin.keyLogin : null;
        } catch (error) {
          logger.warn('USER_SETTINGS', 'Failed to fetch keyLogin', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const response = {
        ...settings,
        keyLogin
      };

      logger.debug('USER_SETTINGS', 'Retrieved user settings successfully', {
        settings: JSON.stringify(response)
      });
      return c.json(response);

    } catch (error) {
      logger.error('USER_SETTINGS', 'Failed to get user settings', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return c.json({ error: 'Internal server error' }, 500);
    }
  })
  .put(
    '/',
    returnUserSettings,
    vValidator('json', UpdateUserSettingsSchema, (result, c) => {
      if (!result.success) {
        const logger = getLogger(c.env);
        logger.debug('USER_SETTINGS', 'Validation failed', {
          error: result.issues
        });
        return c.json({
          error: 'Invalid input data',
          details: result.issues
        }, 400);
      }
    }),
    async (c) => {
      const logger = getLogger(c.env);

      try {
        const updates = c.req.valid('json');
        const userSettings = await c.var.UserSettings;

        logger.debug('USER_SETTINGS', 'Updating user settings', {
          hasApiKeys: !!updates.apiKeys,
          hasPreferences: !!updates.preferences,
          apiKeyCount: updates.apiKeys ? Object.keys(updates.apiKeys).length : 0
        });

        // Update settings using the UserSettings RPC class
        await userSettings.updateSettings(updates);

        logger.info('USER_SETTINGS', 'Successfully updated user settings');
        return c.json({ success: true, message: 'Settings updated successfully' });

      } catch (error) {
        logger.error('USER_SETTINGS', 'Failed to update user settings', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Return more specific error messages
        if (error instanceof Error) {
          if (error.message.includes('encrypt')) {
            return c.json({ error: 'Failed to encrypt API keys' }, 500);
          }
          if (error.message.includes('validation')) {
            console.log(error);
            return c.json({ error: 'Invalid input data' }, 400);
          }
        }

        return c.json({ error: 'Internal server error' }, 500);
      }
    }
  );

export default userSettingsRoutes;
