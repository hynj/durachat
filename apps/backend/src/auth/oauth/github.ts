import { GitHub, OAuth2Tokens } from "arctic";

export type RegisterInformation = {
  id: string,
  githubUserId: string,
  githubUsername: string,
  email: string,
  instanceIP: string
}

export const checkGitHubOAuth = async (github: GitHub, code: string, state: string) => {

  let tokens: OAuth2Tokens;
  try {
    tokens = await github.validateAuthorizationCode(code);
  } catch (e) {
    throw new Error("Invalid Code");
  }

  // TODO: Error handling
  const accessToken = tokens.accessToken();
  const githubUserResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Awesome-Octocat-App'
    }
  });

  if (githubUserResponse.status !== 200) {
    throw new Error("Error");
  }

  if (githubUserResponse.status !== 200) {
    throw new Error("Error");
  }

  const githubUser = await githubUserResponse.json();
  const githubUserId = githubUser.id;
  const githubUsername = githubUser.login;

  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Awesome-Octocat-App'
    }
  });

  if (!response.ok) {
    throw new Error("Error");
  }
  const emails = await response.json() as [{
    email: string,
    primary: boolean,
    verified: boolean,
    visibility: string
  }];

  if (emails.length === 0) {
    throw new Error("No Emails");
  }

  return {
    githubUserId,
    githubUsername,
    email: emails[0]
  }
}

export const loginUser = async (c: HonoContext, githubUserDetails: any) => {
  const user = await c.env.User.get(githubUserDetails.githubUserId)
  if (!user) {
    throw new Error("User not found");
  }

  user.githubUserId = githubUserDetails.githubUserId;
  user.githubUsername = githubUserDetails.githubUsername;
  user.email = githubUserDetails.email;

  await c.env.User.put(user);
}

export const registerUser = async (c: HonoContext, githubUserDetails: any) => {
  const user = new c.env.User.User();

  user.githubUserId = githubUserDetails.githubUserId;
  user.githubUsername = githubUserDetails.githubUsername;
  user.email = githubUserDetails.email;

  await c.env.User.put(user);
}

