import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory"
import { getLogger } from '../utils/logger';
import { User } from "../do/user";

type SessionVariables = {
  session_validated: boolean;
}

export interface EnvExtendedUserSettings {
  Variables: {
    UserSettings: ReturnType<DurableObjectStub<User>['getUserSettings']>,
  }
  Bindings: CloudflareBindings
}


export const confirmSession = createMiddleware<EnvExtendedUserSettings>(async (c, next) => {
  const sessionToken = getCookie(c, 'session_token');
  const userDOId = getCookie(c, 'user_do_id');

  if (!sessionToken || !userDOId) {
    console.log(sessionToken, userDOId);
    console.log('Missing Session');
    return c.text('Missing Session', 400);
  }

  try {
    const userDOName = c.env.User.idFromName(userDOId)
    const userDO = c.env.User.get(userDOName)

    // We will return the stub to the user settings class, the durable object will handle the session validation
    using userSettings = userDO.getUserSettings(sessionToken) as ReturnType<typeof userDO.getUserSettings> & Disposable;
    c.set('UserSettings', userSettings)

    await next()
  }
  catch (e) {
    const logger = getLogger(c.env);
    const error = e instanceof Error ? e.message : 'Unknown error';
    logger.error('AUTH', 'Session validation middleware error', {
      error_message: error,
      stack_trace: e instanceof Error ? e.stack : undefined
    });
    return c.text('Authentication Error: ' + error)
  }
})


export const returnUserSettings = createMiddleware<EnvExtendedUserSettings>(async (c, next) => {
  const sessionToken = getCookie(c, 'session_token');
  const userDOId = getCookie(c, 'user_do_id');

  if (!sessionToken || !userDOId) {
    console.log(sessionToken, userDOId);
    console.log('Missing Session');
    return c.text('Missing Session', 400);
  }

  try {
    const userDOName = c.env.User.idFromName(userDOId)
    const userDO = c.env.User.get(userDOName)

    // We will return the stub to the user settings class, the durable object will handle the session validation
    using userSettings = userDO.getUserSettings(sessionToken) as ReturnType<typeof userDO.getUserSettings> & Disposable;
    c.set('UserSettings', userSettings)

    await next()
  }
  catch (e) {
    const logger = getLogger(c.env);
    const error = e instanceof Error ? e.message : 'Unknown error';
    logger.error('AUTH', 'Session validation middleware error', {
      error_message: error,
      stack_trace: e instanceof Error ? e.stack : undefined
    });
    return c.text('Authentication Error: ' + error)
  }
})


