import type { Database } from "@/shared/database";

/** Status of a top-up request, as stored in `topup_requests.status`. */
export type TopupStatus = Database["public"]["Enums"]["topup_request_status"];

const TOPUP_STATUS_LABELS = {
  pending: "Aguardando confirmação",
  confirmed: "Creditado",
  cancelled: "Recusado",
  withdrawn: "Cancelado",
} as const satisfies Record<TopupStatus, string>;

/**
 * Describes a top-up request status for the user.
 *
 * @param status - The request status.
 * @returns The Portuguese label.
 */
export function describeTopupStatus(status: TopupStatus): string {
  return TOPUP_STATUS_LABELS[status];
}
