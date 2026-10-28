import type { AuthEvent, Session } from "@nelcota/client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Drops cached data on identity changes, then replaces the mounted session view.
 *
 * @param queryClient - Cache whose in-flight queries must be cancelled before replacement.
 * @param replaceSessionView - Remounts the session subtree and revalidates its route guards.
 * @returns The SDK auth listener; token refreshes preserve the current session view.
 */
export function sessionCacheListener(
  queryClient: QueryClient,
  replaceSessionView: () => Promise<unknown>,
) {
  let userId: string | null | undefined;
  return async (event: AuthEvent, session: Session | null): Promise<void> => {
    const nextUserId = session?.user.id ?? null;
    // The first refresh after restoring storage establishes the baseline, not a new account.
    if (userId === undefined && (event === "refreshed" || event === "user_updated")) {
      userId = nextUserId;
      return;
    }
    if (nextUserId === userId) return;
    userId = nextUserId;
    const cancellation = queryClient.cancelQueries();
    queryClient.clear();
    await cancellation;
    await replaceSessionView();
  };
}
