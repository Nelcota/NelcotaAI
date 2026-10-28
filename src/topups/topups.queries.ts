import type { NelcotaClient } from "@nelcota/client";
import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { z } from "zod";

import type { Database } from "@/shared/database";
import { getNelcotaClient } from "@/shared/nelcota";
import { type CreatedAtCursor, nextPageCursor } from "@/shared/pagination";

import { fetchRequestPage, readPendingRequests, type HistoryFilter } from "./topups.repository";
import { monthlyTopupSchema, organizationSummarySchema, pixSettingsSchema } from "./topups.schemas";

const HISTORY_PAGE_SIZE = 20;
export const TOPUP_REFRESH_INTERVAL_IN_MS = 30_000;

// The chart compares each month with the same month one year earlier, so it fetches a
// year more than it shows.
const MONTHS_PER_YEAR = 12;

/** Periods the customer can pick in the charts, in months. */
const QUARTER_IN_MONTHS = 3;
const HALF_YEAR_IN_MONTHS = 6;
export const CHART_PERIODS = [QUARTER_IN_MONTHS, HALF_YEAR_IN_MONTHS, MONTHS_PER_YEAR] as const;

/** One of {@link CHART_PERIODS}. */
export type ChartPeriod = (typeof CHART_PERIODS)[number];

/** Root of every top-up query key, to refresh them all after a change. */
export const TOPUPS_QUERY_KEY = ["topups"] as const;

/** Balance and amount credited this month, for one organization. */
export function organizationBalanceQuery(organizationId: string) {
  return queryOptions({
    queryKey: [...TOPUPS_QUERY_KEY, organizationId, "balance"],
    refetchInterval: TOPUP_REFRESH_INTERVAL_IN_MS,
    queryFn: async () => {
      const { data, error } = await getNelcotaClient().rpc("get_organization_topup_summary", {
        p_organization_id: organizationId,
      });
      if (error != null) {
        throw error;
      }
      return organizationSummarySchema.parse(data);
    },
  });
}

/**
 * Credited amount per month, oldest first, covering the period plus the year before it (for
 * the comparison line). RLS scopes it: the customer's organization, or the whole platform for
 * the admin.
 */
export function monthlyTopupsQuery(periodInMonths: ChartPeriod) {
  const months = periodInMonths + MONTHS_PER_YEAR;
  return queryOptions({
    queryKey: [...TOPUPS_QUERY_KEY, "monthly", months],
    refetchInterval: TOPUP_REFRESH_INTERVAL_IN_MS,
    queryFn: async () => {
      const { data, error } = await getNelcotaClient().rpc("get_monthly_topups", {
        p_months: months,
      });
      if (error != null) {
        throw error;
      }
      return z.array(monthlyTopupSchema).parse(data);
    },
  });
}

/**
 * Reads pending requests independently of payment commands, including recovery after a failed read.
 *
 * @param organizationId - Organization whose requests are visible under the caller's RLS, or
 * null while the profile loads: the query then stays idle (`skipToken`) instead of fetching.
 * @param client - Authorized client; resolved lazily when omitted.
 * @returns A polling query that performs only database reads.
 */
export function pendingTopupRequestsQuery(
  organizationId: string | null,
  client?: NelcotaClient<Database>,
) {
  return queryOptions({
    queryKey: [...TOPUPS_QUERY_KEY, organizationId, "pending"],
    queryFn:
      organizationId == null
        ? skipToken
        : async () => await readPendingRequests(organizationId, client),
    refetchInterval: TOPUP_REFRESH_INTERVAL_IN_MS,
  });
}

/** Full request history, newest first, with a unique timestamp/ID cursor. */
export function topupHistoryQuery(organizationId: string, filter: HistoryFilter) {
  return infiniteQueryOptions({
    queryKey: [...TOPUPS_QUERY_KEY, organizationId, "history", filter],
    initialPageParam: null as CreatedAtCursor | null,
    queryFn: async ({ pageParam }) =>
      await fetchRequestPage(organizationId, filter, pageParam, HISTORY_PAGE_SIZE),
    getNextPageParam: (lastPage) =>
      nextPageCursor(lastPage, HISTORY_PAGE_SIZE, (row) => ({
        created_at: row.created_at,
        id: row.id,
      })),
    refetchInterval: TOPUP_REFRESH_INTERVAL_IN_MS,
  });
}

/** Complete ledger totals for the displayed months, independent of history filters and pages. */
export function monthCreditTotalsQuery(organizationId: string, months: readonly string[]) {
  const distinctMonths = [...new Set(months)].toSorted();
  return queryOptions({
    queryKey: [...TOPUPS_QUERY_KEY, organizationId, "month-totals", distinctMonths],
    refetchInterval: TOPUP_REFRESH_INTERVAL_IN_MS,
    queryFn: async () => {
      const { data, error } = await getNelcotaClient().rpc("get_topup_month_totals", {
        p_organization_id: organizationId,
        p_months: distinctMonths,
      });
      if (error != null) throw error;
      return z.array(monthlyTopupSchema).parse(data);
    },
    enabled: distinctMonths.length > 0,
  });
}

/** Pix receiving data and accepted top-up range. */
export const pixSettingsQuery = queryOptions({
  queryKey: ["settings", "pix"],
  queryFn: async () => {
    const { data, error } = await getNelcotaClient()
      .from("settings")
      .select("pix_key,pix_receiver_name,pix_city,minimum_topup_cents,maximum_topup_cents")
      .single();
    if (error != null) {
      throw error;
    }
    return pixSettingsSchema.parse(data);
  },
});
