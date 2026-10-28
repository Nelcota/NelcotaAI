import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { readAccessToken } from "./access-token";
import { onlinePendingRequestIds, reconcilePendingPayments } from "./pending-payments.service";
import { TOPUPS_QUERY_KEY, TOPUP_REFRESH_INTERVAL_IN_MS } from "./topups.queries";

type PendingRequest = Parameters<typeof onlinePendingRequestIds>[0][number];
type ReconciliationBatch = {
  readonly organizationId: string;
  readonly requestIds: readonly string[];
};

/**
 * Reconciles online attempts independently of pending-list reads and retries transport failures.
 *
 * @param organizationId - Current organization, or null while the profile is unavailable.
 * @param requests - Successfully read pending snapshot; database polling owns its refresh policy.
 */
export function usePendingPaymentReconciliation(
  organizationId: string | null,
  requests: readonly PendingRequest[] | undefined,
): void {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const requestKey = onlinePendingRequestIds(requests ?? [])
    .toSorted()
    .join(",");
  const { mutate } = useMutation({
    mutationFn: async ({ requestIds }: ReconciliationBatch) => {
      try {
        return await reconcilePendingPayments(requestIds, await readAccessToken());
      } finally {
        inFlight.current = false;
      }
    },
    onSuccess: (result) => {
      if (result.failed > 0)
        console.warn("pending payment reconciliation will retry", { failed: result.failed });
    },
    onError: (error: unknown) =>
      console.error("pending payment reconciliation failed", {
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    onSettled: async (_result, _error, batch) => {
      await queryClient.invalidateQueries({
        queryKey: [...TOPUPS_QUERY_KEY, batch.organizationId, "pending"],
      });
    },
  });

  useEffect(() => {
    if (organizationId == null || requestKey === "") return;
    const requestIds = requestKey.split(",");
    const run = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutate({ organizationId, requestIds });
    };
    run();
    // Same cadence as the pending-list poll, so a settled payment shows up on the next read.
    const timer = setInterval(run, TOPUP_REFRESH_INTERVAL_IN_MS);
    return () => clearInterval(timer);
  }, [organizationId, requestKey, mutate]);
}
