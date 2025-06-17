import { DurableObject } from "cloudflare:workers";
import { drizzle, DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from '../../drizzle/control/migrations';
import { users, type NewUser } from "../db/control/auth";
import { eq } from "drizzle-orm";
import { RegisterInformation } from "../auth/oauth/github";
import { generateSecureCapitalRandomString } from "../auth/utils";

export class Control extends DurableObject {
  storage: DurableObjectStorage;
  env: CloudflareBindings;
  db: DrizzleSqliteDODatabase<any>;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);

    this.storage = ctx.storage;
    this.env = env;
    this.db = drizzle(this.storage, { logger: false });

    ctx.blockConcurrencyWhile(async () => {
      await this._migrate();
    });

  }

  async _migrate() {
    migrate(this.db, migrations);
  }

  async removeUser(githubUserId: string) {
    await this.db.delete(users).where(eq(users.oAuthID, githubUserId));
  }

  async registerUserKey(ip: string) {
    // Check if user IP already exists
    const userTaken = await this.db.select({ id: users.id }).from(users).where(eq(users.instanceIP, ip));

    if (userTaken.length > 5) {
      throw new Error("Too many users from this IP");
    }

    const [user] = await this.db.insert(users).values({ instanceIP: ip }).returning();
    return user;
  }

  async registerGitHubUser(user: RegisterInformation) {
    return await this.db.insert(users).values({
      id: user.id,
      oAuthID: user.githubUserId,
      oAuthProvider: "github",
      email: user.email,
      keyLogin: generateSecureCapitalRandomString(),
      instanceIP: user.instanceIP
    }).returning();
  }

  async getUserByGitHubId(githubUserId: string) {
    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.oAuthID, githubUserId));
    return user;
  }

  async getUserByKeyLogin(keyLogin: string) {
    const [user] = await this.db.select({ id: users.id, oAuthID: users.oAuthID }).from(users).where(eq(users.keyLogin, keyLogin));
    return user;
  }

  async getUserKeyLoginById(userId: string) {
    const [user] = await this.db.select({ keyLogin: users.keyLogin }).from(users).where(eq(users.id, userId));
    return user;
  }
}
