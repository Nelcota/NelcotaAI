import type { NotificationItem } from "@/layout";
import { formatCents } from "@/shared/format";

import type { TopupPaymentMethod } from "./topups.schemas";

interface PendingTopupLike {
  readonly id: string;
  readonly amount_cents: number;
  readonly payment_method: TopupPaymentMethod;
}

const PENDING_DESCRIPTIONS: Readonly<Record<TopupPaymentMethod, string>> = {
  manual_pix: "Pix manual · aguardando o pagamento e a confirmação",
  pix: "Pix · aguardando o pagamento do código",
  card: "Cartão · pagamento em análise",
};

/**
 * Turns the customer's pending top-ups into bell notifications.
 *
 * @param requests - Pending requests, newest first as the dashboard reads them.
 * @returns One notification per request, in the same order.
 */
export function describePendingTopupNotifications(
  requests: readonly PendingTopupLike[],
): NotificationItem[] {
  return requests.map((request) => ({
    id: request.id,
    title: `Recarga de ${formatCents(request.amount_cents)}`,
    description: PENDING_DESCRIPTIONS[request.payment_method],
  }));
}
