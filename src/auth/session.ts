import type { Session } from "@nelcota/client";

import { getNelcotaClient } from "@/shared/nelcota";
import { throwRedirect } from "@/shared/redirect";

/**
 * Loads the stored session, refreshing it first when it is about to expire.
 *
 * @returns The session, or null when nobody is signed in.
 * @throws {NelcotaError} When the session cannot be read or refreshed (network, storage).
 */
export async function loadSession(): Promise<Session | null> {
  const { data: session, error } = await getNelcotaClient().auth.getSession();
  if (error != null) {
    throw error;
  }
  return session;
}

/**
 * Route guard for authenticated pages: sends visitors to the login page.
 *
 * @returns The signed-in session.
 * @throws A router redirect to `/login` when nobody is signed in.
 */
export async function requireSession(): Promise<Session> {
  const session = await loadSession();
  if (session == null) {
    throwRedirect({ to: "/login" });
  }
  return session;
}

/**
 * Route guard for the login pages: sends signed-in users to the dashboard.
 *
 * @throws A router redirect to `/painel` when someone is already signed in.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await loadSession();
  if (session != null) {
    throwRedirect({ to: "/painel" });
  }
}
