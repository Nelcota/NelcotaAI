import { getNelcotaClient } from "@/shared/nelcota";

import { SessionExpiredError } from "./topups.errors";

/**
 * Reads the current access token, refreshed by the SDK when needed, to authorize a call to
 * the app's payment server functions.
 *
 * @returns The access token.
 * @throws {SessionExpiredError} When nobody is signed in anymore.
 */
export async function readAccessToken(): Promise<string> {
  const token = await getNelcotaClient().auth.accessToken();
  if (token == null) {
    throw new SessionExpiredError();
  }
  return token;
}
