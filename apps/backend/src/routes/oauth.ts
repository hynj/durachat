import { Context, Hono } from "hono";
import { GitHub } from "arctic";
import { generateState } from "arctic";
import { getCookie, setCookie } from "hono/cookie";
import type { OAuth2Tokens } from "arctic";
import { checkGitHubOAuth } from "../auth/oauth/github";
import { getRegion } from "../utils/do-helpers";
import { getConnInfo } from 'hono/cloudflare-workers'
import { uuidv7 } from "uuidv7";
import { getLogger } from '../utils/logger';

export const loginUser = async (c: Context<{ Bindings: CloudflareBindings }>, doName: string) => {
  const userDOID = c.env.User.idFromName(doName);
  const userDO = c.env.User.get(userDOID);

  const ip = getConnInfo(c).remote.address ?? 'Unknown'

  const session = await userDO.createSession({
    metadata: {
      ipAddress: ip,
    },
    is2FAVerified: false
  });

  setCookie(c, 'session_token', session.sessionToken, {
    path: '/',
    httpOnly: true,
    secure: c.env.WORKER_ENV !== 'local',
    sameSite: 'Lax',
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
  });

  setCookie(c, 'user_do_id', doName, {
    path: '/',
    httpOnly: false,
    secure: c.env.WORKER_ENV !== 'local',
    sameSite: 'Lax',
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
  });

  return c.redirect('/');

}

const app = new Hono<{ Bindings: CloudflareBindings }>();


app.use("/login/github", async (c) => {
  const github = new GitHub(c.env.GITHUB_CLIENT_ID, c.env.GITHUB_CLIENT_SECRET, null);

  const state = generateState();

  const url = github.createAuthorizationURL(state, ["user:email"]);

  setCookie(c, "github_oauth_state", state, {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: "lax"
  });

  return c.redirect(url);
})

app.use("/github/callback", async (c) => {
  const { code, state } = c.req.query()

  const storedState = getCookie(c, "github_oauth_state") ?? null;
  if (code === null || state === null || storedState === null) {
    return c.text("Invalid Request", 400);
  }
  if (state !== storedState) {
    return c.text("Invalid State", 400);
  }

  try {
    const github = new GitHub(c.env.GITHUB_CLIENT_ID, c.env.GITHUB_CLIENT_SECRET, null);

    //Get user details or throw
    const githubUserDetails = await checkGitHubOAuth(github, code, state);

    // Check if user exists
    // We will check the cordinating durable object for the user based on location
    // Find region
    const continent: string | null = c.req.raw.cf?.continent as any;
    const region = getRegion(continent);

    // Get auth durable object
    const controlDOId = c.env.Control.idFromName(region)
    const controlDO = c.env.Control.get(controlDOId)

    let userFound = await controlDO.getUserByGitHubId(githubUserDetails.githubUserId)

    // Were going to pass through the context here which doesen't feel great..
    if (userFound) {
      return await loginUser(c, userFound.id);
    }

    // If this fails, we will check KV
    // If in KV we will have the DO region ID and therefore we can get the controlDO
    const userFromKV = await c.env.DuraUsersKV.get(githubUserDetails.githubUserId)
    if (userFromKV) {
      const controlDOIdFromKV = c.env.Control.idFromName(userFromKV)
      const controlDOFromKV = c.env.Control.get(controlDOIdFromKV)

      userFound = await controlDOFromKV.getUserByGitHubId(githubUserDetails.githubUserId)
      console.log("USER FOUND IN KV DO:", userFromKV)
      if (!userFound) throw new Error("User not found");
    } else {
      const ip = getConnInfo(c).remote.address ?? 'Unknown'
      let registerState: 'defualt' | 'control' | 'KV' | 'token' | 'done' | 'error' = 'defualt'
      const userID = uuidv7();

      try {
        // Durable object creation with a name can take a few 100ms
        // So we will create both the user and the control DO in parallel
        // Then remove them if issues

        const userDBDetails = controlDO.registerGitHubUser({
          id: userID,
          githubUserId: githubUserDetails.githubUserId,
          githubUsername: githubUserDetails.githubUsername,
          email: githubUserDetails.email.email,
          instanceIP: ip
        });

        const userDOName = c.env.User.idFromName(userID)
        const userDO = c.env.User.get(userDOName)
        const initUserDO = userDO.init(userID)

        const data = await Promise.all([userDBDetails, initUserDO])

        registerState = 'KV';
        // Now that we have stored the user in the controlling DO, we can update KV
        await c.env.DuraUsersKV.put(githubUserDetails.githubUserId, region)

        return await loginUser(c, userID);

      } catch (e) {
        // Rollback
        // This could probably go into a waitUntill()? or a promise.all()
        await c.env.DuraUsersKV.delete(githubUserDetails.githubUserId)

        await controlDO.removeUser(githubUserDetails.githubUserId);

        await c.env.User.get(c.env.User.idFromName(userID)).deleteData()

        const logger = getLogger(c.env);
        logger.error('AUTH', 'OAuth registration failed', {
          register_state: registerState,
          github_user_id: githubUserDetails.githubUserId,
          github_username: githubUserDetails.githubUsername,
          ip: ip,
          error_message: e instanceof Error ? e.message : String(e),
          stack_trace: e instanceof Error ? e.stack : undefined
        });
        return c.text('Error: ' + (e instanceof Error ? e.message : String(e)))
      }
    }

    return await loginUser(c, userFound.id);
  }
  catch (e) {
    const logger = getLogger(c.env);
    logger.error('AUTH', 'OAuth callback failed', {
      error_message: e instanceof Error ? e.message : String(e),
      stack_trace: e instanceof Error ? e.stack : undefined
    });
    return c.text("Error", 500);
  }

  return c.text("Success");

})

export default app;
