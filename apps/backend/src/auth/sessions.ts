// https://lucia-auth.com/sessions/basic

import { generateSecureRandomString, hashSecret } from "./utils";

export async function createSession(): Promise<SessionStub> {
	const now = new Date();

	const id = generateSecureRandomString();
	const secret = generateSecureRandomString();
	const secretHash = await hashSecret(secret);

	const token = id + "." + secret;

	const session: SessionStub = {
		id,
		secretHash,
		createdAt: now,
		token
	};

	return session;
}


export type SessionStub = {
  id: string;
  secretHash: Uint8Array;
  createdAt: Date;
  token: string;
};



