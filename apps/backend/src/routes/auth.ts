import { Hono } from 'hono'
import { getRegion } from '../utils/do-helpers';
import { getConnInfo } from 'hono/cloudflare-workers'
import { setCookie } from 'hono/cookie';
import { getLogger } from '../utils/logger';
import { loginUser } from './oauth';

const app = new Hono<{ Bindings: CloudflareBindings }>()
  .post('/register', async (c) => {
    // TODO: Rate Limit

    let registrationState: 'control' | 'user' | 'token' | 'done' | 'error' = 'control'

    try {
      // Find region
      const continent: string | null = c.req.raw.cf?.continent as any;
      const region = getRegion(continent);

      // Get auth durable object
      const controlDOId = c.env.Control.idFromName(region)
      const controlDO = c.env.Control.get(controlDOId)

      // Register user
      const ip = getConnInfo(c).remote.address ?? 'Unknown'
      const registerResult = await controlDO.registerUserKey(ip)
      registrationState = 'user'

      // Get the user durable object
      const userDOId = c.env.User.idFromName(registerResult.id)
      const userDO = c.env.User.get(userDOId)

      // Calling this will start the durable object and run the migrations
      await userDO.init(registerResult.id)
      registrationState = 'token'

      // Add to KV
      await c.env.DuraUsersKV.put(registerResult.keyLogin, region)

      // Create session
      const session = await userDO.createSession({
        metadata: {
          ipAddress: ip,
        },
        is2FAVerified: false,
      })

      registrationState = 'done'

      // Return session
      setCookie(c, 'session_token', session.sessionToken, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      });

      setCookie(c, 'user_do_id', registerResult.id, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      });

      return c.json({ code: registerResult.keyLogin })

    } catch (e) {
      const logger = getLogger(c.env);
      logger.error('AUTH', 'Registration failed', {
        registration_state: registrationState,
        ip: getConnInfo(c).remote.address ?? 'Unknown',
        error_message: e instanceof Error ? e.message : String(e),
        stack_trace: e instanceof Error ? e.stack : undefined
      });
      return c.text('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
  })

  .post('/login', async (c) => {
    // TODO: Rate Limit

    let loginState: 'control' | 'user' | 'session' | 'done' | 'error' = 'control'

    try {
      // Get request body
      const body = await c.req.json()
      const { keyLogin } = body

      if (!keyLogin || typeof keyLogin !== 'string') {
        return c.json({ error: 'Invalid login code' }, 400)
      }

      // Find region
      const continent: string | null = c.req.raw.cf?.continent as any;
      const region = getRegion(continent);

      // Get auth durable object
      const controlDOId = c.env.Control.idFromName(region)
      const controlDO = c.env.Control.get(controlDOId)

      // Try to find user by keyLogin in the local control DO
      const user = await controlDO.getUserByKeyLogin(keyLogin)
      if (user.oAuthID) throw new Error("Can't login with key if a Github User");
      if (user) {
        return await loginUser(c, user.id);
      }

      // If not found, try to find user in KV
      const userFromKV = await c.env.DuraUsersKV.get(keyLogin)
      if (!userFromKV) {
        return c.json({ error: 'Invalid login code' }, 401)
      }

      // Try the found contorl DO
      const controlDOIDFromKV = c.env.Control.idFromName(userFromKV)
      const controlDOFromKV = c.env.Control.get(controlDOIDFromKV)

      const userKV = await controlDOFromKV.getUserByKeyLogin(keyLogin)
      if (userKV.oAuthID) throw new Error("Can't login with key if a Github User");

      if (!userKV) {
        return c.json({ error: 'Invalid login code' }, 401)
      }
      return await loginUser(c, userKV.id);
    } catch (e) {
      const logger = getLogger(c.env);
      logger.error('AUTH', 'Login failed', {
        login_state: loginState,
        ip: getConnInfo(c).remote.address ?? 'Unknown',
        error_message: e instanceof Error ? e.message : String(e),
        stack_trace: e instanceof Error ? e.stack : undefined
      });
      return c.json({ error: 'Login failed' }, 500)
    }
  })

  .get('/test', (c) => {
    return c.text('Hello Hono!')
  })

export default app
