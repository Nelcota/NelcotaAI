import { getNelcotaClient } from "@/shared/nelcota";
import { throwRedirect } from "@/shared/redirect";

import { describeAuthError } from "./auth-error";

/**
 * Reads the recovery token from a password recovery link and removes it from the address bar.
 *
 * @returns The token, or null when the page was opened without a valid recovery link.
 */
export function readRecoveryToken(): string | null {
  const link = getNelcotaClient().auth.readEmailLink();
  if (link?.type !== "recovery") {
    return null;
  }
  return link.token;
}

/**
 * Signs in with a magic link (or a signup confirmation link) and goes to the dashboard.
 *
 * @returns A message for the user when the link is missing, invalid or expired.
 * @throws A router redirect to `/painel` when the sign-in succeeds.
 */
export async function signInWithEmailLink(): Promise<string> {
  const auth = getNelcotaClient().auth;
  const link = auth.readEmailLink();
  if (link == null || link.type === "recovery") {
    return "Este endereço não tem um link de acesso válido. Peça um novo.";
  }
  const { error } = await auth.verifyEmailLink({ type: link.type, token: link.token });
  if (error != null) {
    return describeAuthError(error, "open_link");
  }
  throwRedirect({ to: "/painel" });
}
