import type { NotificationItem } from "@/layout";
import { formatCents, formatDateTime } from "@/shared/format";

interface PendingRequestLike {
  readonly id: string;
  readonly amount_cents: number;
  readonly created_at: string;
  readonly organization: { readonly name: string } | null;
}

/**
 * Turns the admin queue into bell notifications: who asked, how much and when.
 *
 * @param requests - Pending manual Pix requests, oldest first as the queue reads them.
 * @returns One notification per request, newest first.
 */
export function describePendingRequestNotifications(
  requests: readonly PendingRequestLike[],
): NotificationItem[] {
  return requests.toReversed().map((request) => ({
    id: request.id,
    title: `${request.organization?.name ?? "Empresa removida"} · ${formatCents(request.amount_cents)}`,
    description: `Pix manual · pedido em ${formatDateTime(request.created_at)}`,
  }));
}
