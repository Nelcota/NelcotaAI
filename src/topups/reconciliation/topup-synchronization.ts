import type { QueryClient } from "@tanstack/react-query";

import { TOPUPS_QUERY_KEY } from "../topups.queries";

/** Refreshes dependent financial views once a pending snapshot changes, without refetching itself. */
export async function synchronizeTopups(
  queryClient: QueryClient,
  previous: readonly string[] | null,
  current: readonly string[],
): Promise<void> {
  const before = new Set(previous ?? []);
  const after = new Set(current);
  if (previous != null && before.size === after.size && before.isSubsetOf(after)) return;
  await queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === TOPUPS_QUERY_KEY[0] && query.queryKey.at(-1) !== "pending",
  });
}
