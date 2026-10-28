import { toSaoPauloCalendarDate } from "@/shared/dates";

/** The fields of a request that grouping needs. */
interface GroupableRequest {
  readonly amount_cents: number;
  readonly status: string;
  readonly created_at: string;
}

/** Requests of one Sao Paulo calendar month, newest month first. */
export interface MonthGroup<Request extends GroupableRequest> {
  /** First day of the month, as `YYYY-MM-01`. */
  readonly month: string;
  readonly requests: readonly Request[];
  /** Sum of the confirmed requests of the month, in cents. */
  readonly creditedCents: number;
}

/**
 * Groups requests by the Sao Paulo month in which they were made, keeping their order.
 *
 * @param requests - Requests sorted newest first.
 * @returns One group per month, in the same order, with the amount credited in each.
 * @throws {RangeError} When a request has an invalid `created_at`.
 */
export function groupRequestsByMonth<Request extends GroupableRequest>(
  requests: readonly Request[],
): MonthGroup<Request>[] {
  const byMonth = Map.groupBy(
    requests,
    (request) =>
      `${toSaoPauloCalendarDate(new Date(request.created_at)).slice(0, "YYYY-MM".length)}-01`,
  );
  return [...byMonth].map(([month, monthRequests]) => ({
    month,
    requests: monthRequests,
    creditedCents: monthRequests
      .filter((request) => request.status === "confirmed")
      .reduce((total, request) => total + request.amount_cents, 0),
  }));
}
