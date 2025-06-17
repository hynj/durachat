import { createSession } from "../../auth/sessions";
import { constantTimeEqual, hashSecret } from "../../auth/utils";
import { NewSession, sessions } from "../../db/user/sessions";
import { eq } from "drizzle-orm";
import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

const sessionExpiresInSeconds = 1000 * 60 * 60 * 24 * 7;

export async function createUserSession(
  db: DrizzleSqliteDODatabase<any>,
  userID: string,
  sessionFlags: Pick<NewSession, 'metadata' | 'is2FAVerified'>
) {
  const sessionStub = await createSession();

  const [session] = await db.insert(sessions).values({
    id: sessionStub.id,
    userId: userID,
    sessionToken: sessionStub.token,
    refreshToken: sessionStub.token,
    secretHash: sessionStub.secretHash,
    metadata: sessionFlags.metadata,
    is2FAVerified: sessionFlags.is2FAVerified,
    expiresAt: new Date(sessionStub.createdAt.getTime() + 1000 * 60 * 60 * 24 * 7),
    createdAt: sessionStub.createdAt,
  }).returning();

  return session;
}

export async function validateUserSession(
  db: DrizzleSqliteDODatabase<any>,
  sessionToken: string
): Promise<boolean> {
  const now = new Date();
  const tokenParts = sessionToken.split(".");
  if (tokenParts.length != 2) {
    throw new Error("Invalid session token");
  }
  const sessionId = tokenParts[0];
  const sessionSecret = tokenParts[1];

  const [sessionResult] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

  if (!sessionResult) {
    throw new Error("Invalid session token");
  }

  if (now.getTime() - sessionResult.createdAt.getTime() >= sessionExpiresInSeconds * 1000) {
    await deleteUserSession(db, sessionId);
    throw new Error("Session expired");
  }

  const tokenSecretHash = await hashSecret(sessionSecret);
  const validSecret = constantTimeEqual(tokenSecretHash, sessionResult.secretHash);

  if (!validSecret) {
    throw new Error("Invalid secret");
  }
  return true;
}

export async function deleteUserSession(
  db: DrizzleSqliteDODatabase<any>,
  sessionId: string
) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}