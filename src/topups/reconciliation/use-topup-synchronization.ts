import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { synchronizeTopups } from "./topup-synchronization";

/**
 * Keeps financial views consistent with confirmations received by polling or reconciliation.
 *
 * @param organizationId - Organization whose pending snapshot is being observed, or null before profile loading.
 * @param requests - Latest pending requests; undefined while the first snapshot is loading.
 */
export function useTopupSynchronization(
  organizationId: string | null,
  requests: readonly { readonly id: string }[] | undefined,
) {
  const queryClient = useQueryClient();
  const previous = useRef<{ organizationId: string; ids: readonly string[] } | null>(null);
  useEffect(() => {
    if (organizationId == null || requests == null) return;
    const ids = requests.map((request) => request.id);
    const before =
      previous.current?.organizationId === organizationId ? previous.current.ids : null;
    previous.current = { organizationId, ids };
    void synchronizeTopups(queryClient, before, ids).catch((error: unknown) =>
      console.error("top-up cache synchronization failed", error),
    );
  }, [organizationId, requests, queryClient]);
}
