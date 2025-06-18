import { DurableObject, RpcTarget } from "cloudflare:workers";
import { drizzle, DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from '../../drizzle/user/migrations';
import { NewSession } from "../db/user/sessions";
import { createUserSession, validateUserSession, deleteUserSession } from "./utils/session-helpers";
import { UserChatRPC } from "./classes/UserChatRPC";
import { UserAttachmentRPC } from "./classes/UserAttachmentRPC";
import { UserShare } from "./classes/UserShare";
import { getLogger } from '../utils/logger';
import { UserSettings } from "./classes/UserSettings";
import { conversations, messages, userSettings } from "../db/user/data";
import { users } from "../db/control/auth";

export class User extends DurableObject {
  storage: DurableObjectStorage;
  env: CloudflareBindings;
  db: DrizzleSqliteDODatabase<any>;
  ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);

    this.ctx = ctx;
    this.storage = ctx.storage;
    this.env = env;
    this.db = drizzle(this.storage, { logger: false });

    ctx.blockConcurrencyWhile(async () => {
      await this._migrate();
    });
  }

  async _migrate() {
    const logger = getLogger(this.env);
    logger.info('DATABASE', 'Running database migrations');
    await migrate(this.db, migrations);
    logger.info('DATABASE', 'Database migrations completed');
  }

  async deleteData() {
    await this.storage.deleteAll();
  }

  async init(userID: string) {
    const storedUserID = await this.storage.get('userID');

    if (storedUserID) {
      throw new Error("User already initialized");
    }

    // Initialize user settings with defaults
    await this.db.insert(userSettings).values({
      id: "user_settings",
      balanceInOneHundreths: 50, // £50 default balance
      preferences: {
        defaultModel: "gemini-2.5-flash-preview-05-20",
        defaultProvider: "google",
        theme: "light",
      }
    });

    await this.storage.put('userID', userID);
  }

  async createSession(sessionFlags: Pick<NewSession, 'metadata' | 'is2FAVerified'>) {
    const userID = await this.storage.get<string | null>('userID');

    if (!userID) {
      throw new Error("User not initialized");
    }
    

    return createUserSession(this.db, userID, sessionFlags);
  }

  async validateSession(sessionToken: string) {
    return validateUserSession(this.db, sessionToken);
  }

  async deleteSession(sessionId: string) {
    return deleteUserSession(this.db, sessionId);
  }

  async getChatRPC(sessionToken: string): Promise<UserChatRPC> {
    await this.validateSession(sessionToken);
    return new UserChatRPC(this.db, this.ctx, this.storage, this.env);
  }

  async getAttachmentRPC(sessionToken: string): Promise<UserAttachmentRPC> {
    await this.validateSession(sessionToken);
    return new UserAttachmentRPC(this.db, this.env);
  }

  async getShareRPC(): Promise<UserShare> {
    // No session validation needed for public share access
    return new UserShare(this.db, this.ctx, this.storage, this.env);
  }

  async fetchWs(request: Request, sessionToken: string): Promise<Response> {
    const session = await this.validateSession(sessionToken);
    if (!session) {
      return new Response('Invalid session', { status: 400 });
    }
    if (request.headers.get('upgrade') === 'websocket') {
      const chatRPC = await this.getChatRPC(sessionToken);
      return chatRPC.handleWebSocket(request);
    }
    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    // Forward to chat RPC - need session token from WebSocket tags
    const tags = this.ctx.getTags(ws);
    const sessionTag = tags.find(tag => tag.startsWith('sessionId:'));
    if (!sessionTag) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
      return;
    }

    try {
      // For WebSocket messages, we need to get session token from storage or validate differently
      // For now, we'll create a temporary chat RPC without session validation
      const chatRPC = new UserChatRPC(this.db, this.ctx, this.storage, this.env);
      await chatRPC.webSocketMessage(ws, message);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'WebSocket error' }));
    }
  }

  async getUserSettings(sessionToken: string) {
    const logger = getLogger(this.env);
    try {
      await this.validateSession(sessionToken);
      const userID = await this.storage.get<string | null>('userID');
      
      if (!userID) {
        throw new Error("User not initialized");
      }
      
      return new UserSettings(this.db, this.ctx, this.storage, this.env, userID);
    }
    catch (error) {
      logger.info("AUTH", "Auth failure", {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error("AUTH_FAILURE");
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Forward to chat RPC
    const chatRPC = new UserChatRPC(this.db, this.ctx, this.storage, this.env);
    await chatRPC.webSocketClose(ws, code, reason, wasClean);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionToken = request.headers.get('X-Session-token');

    if (!sessionToken) {
      return new Response('Missing session token', { status: 400 });
    }

    const session = await this.validateSession(sessionToken);
    if (!session) {
      return new Response('Invalid session', { status: 400 });
    }

    if (url.pathname === '/ws' || request.headers.get('upgrade') === 'websocket') {
      const chatRPC = await this.getChatRPC(sessionToken);
      return chatRPC.handleWebSocket(request);
    }

    return new Response('Not found', { status: 404 });
  }
}
