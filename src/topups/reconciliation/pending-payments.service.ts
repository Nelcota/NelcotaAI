import { refreshTopupPaymentFn } from "@/payments";

import type { TopupPaymentMethod } from "../topups.schemas";

type PendingRequest = {
  readonly id: string;
  readonly payment_method: TopupPaymentMethod;
};
type RefreshPayment = (input: {
  readonly accessToken: string;
  readonly requestId: string;
}) => ReturnType<typeof refreshTopupPaymentFn>;

/** Selects online attempts for reconciliation without changing the pending read model. */
export function onlinePendingRequestIds(requests: readonly PendingRequest[]): string[] {
  return requests
    .filter((request) => request.payment_method !== "manual_pix")
    .map((request) => request.id);
}

async function refreshPayment(input: Parameters<RefreshPayment>[0]) {
  return await refreshTopupPaymentFn({ data: input });
}

/** Retries independent payment commands without discarding a successful database snapshot. */
export async function reconcilePendingPayments(
  requestIds: readonly string[],
  accessToken: string,
  refresh: RefreshPayment = refreshPayment,
) {
  const results = await Promise.allSettled(
    requestIds.map(async (requestId) => await refresh({ requestId, accessToken })),
  );
  const failed = results.filter(
    (result) => result.status === "rejected" || result.value.ok === false,
  ).length;
  return { checked: results.length, failed };
}
