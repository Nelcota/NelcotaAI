import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { getNelcotaClient } from "@/shared/nelcota";
import { nextPageCursor, type CreatedAtCursor } from "@/shared/pagination";

import {
  ORGANIZATION_SUMMARY_COLUMNS,
  fetchOrganizations,
  fetchPlatformSummary,
} from "./admin.repository";
import {
  ledgerEntrySchema,
  memberRowSchema,
  organizationSummarySchema,
  pendingRequestSchema,
  requestHistoryRowSchema,
} from "./admin.schemas";

/**
 * Shared cadence of the administrator queue and summary. The admin acts on new requests by
 * hand, so a 30 s refresh shows new ones without reloading.
 */
const ADMIN_REFRESH_INTERVAL_IN_MS = 30_000;
const PENDING_REQUESTS_LIMIT = 100;
const LEDGER_PAGE_SIZE = 25;
const HISTORY_PAGE_SIZE = 25;

/** Root of every admin query key, to refresh them all after an action. */
export const ADMIN_QUERY_KEY = ["admin"] as const;

/**
 * Pending manual Pix requests for the administrator queue. Online payments are reconciled separately.
 */
export const pendingRequestsQuery = queryOptions({
  queryKey: [...ADMIN_QUERY_KEY, "pending-requests"],
  queryFn: async () => {
    const { data, error } = await getNelcotaClient()
      .from("topup_requests")
      .select(
        "id,organization_id,amount_cents,receipt_path,created_at,organization:organizations(name)",
      )
      .eq("status", "pending")
      .eq("payment_method", "manual_pix")
      .order("created_at", { ascending: true })
      .limit(PENDING_REQUESTS_LIMIT);
    if (error != null) {
      throw error;
    }
    return z.array(pendingRequestSchema).parse(data);
  },
  refetchInterval: ADMIN_REFRESH_INTERVAL_IN_MS,
});

/** Every organization with its balance, ordered by name. */
export const organizationsQuery = queryOptions({
  queryKey: [...ADMIN_QUERY_KEY, "organizations"],
  queryFn: async () => await fetchOrganizations(getNelcotaClient()),
});

/** One organization with its balance; null when it does not exist. */
export function organizationQuery(organizationId: string) {
  return queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, "organization", organizationId],
    queryFn: async () => {
      const { data, error } = await getNelcotaClient()
        .from("organization_summaries")
        .select(ORGANIZATION_SUMMARY_COLUMNS)
        .eq("id", organizationId)
        .maybeSingle();
      if (error != null) {
        throw error;
      }
      if (data == null) {
        return null;
      }
      const summary = organizationSummarySchema.parse(data);
      return {
        id: summary.id,
        name: summary.name,
        document: summary.document,
        status: summary.status,
        created_at: summary.created_at,
        balanceCents: summary.balance_cents,
        monthTopupCents: summary.month_topup_cents,
      };
    },
  });
}

/** People linked to an organization. */
export function organizationMembersQuery(organizationId: string) {
  return queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, "organization", organizationId, "members"],
    queryFn: async () => {
      const { data, error } = await getNelcotaClient()
        .from("profiles")
        .select("user_id,name,role,created_at")
        .eq("organization_id", organizationId)
        .order("name");
      if (error != null) {
        throw error;
      }
      return z.array(memberRowSchema).parse(data);
    },
  });
}

/** An organization's ledger, newest first, loaded page by page with a created_at cursor. */
export function organizationLedgerQuery(organizationId: string) {
  return infiniteQueryOptions({
    queryKey: [...ADMIN_QUERY_KEY, "organization", organizationId, "ledger"],
    initialPageParam: null as CreatedAtCursor | null,
    queryFn: async ({ pageParam }) => {
      let query = getNelcotaClient()
        .from("wallet_transactions")
        .select("id,type,amount_cents,description,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(LEDGER_PAGE_SIZE);
      if (pageParam != null) {
        query = query.or((c) => [
          c.lt("created_at", pageParam.created_at),
          c.and([c.eq("created_at", pageParam.created_at), c.lt("id", pageParam.id)]),
        ]);
      }
      const { data, error } = await query;
      if (error != null) {
        throw error;
      }
      return z.array(ledgerEntrySchema).parse(data);
    },
    getNextPageParam: (lastPage) =>
      nextPageCursor(lastPage, LEDGER_PAGE_SIZE, (row) => ({
        created_at: row.created_at,
        id: row.id,
      })),
  });
}

/** Filter of the request history: one status, or every request. */
export type RequestHistoryFilter = "all" | "pending" | "confirmed" | "cancelled" | "withdrawn";

/** Every top-up request of the platform, newest first, loaded with a created_at cursor. */
export function requestHistoryQuery(filter: RequestHistoryFilter) {
  return infiniteQueryOptions({
    queryKey: [...ADMIN_QUERY_KEY, "request-history", filter],
    initialPageParam: null as CreatedAtCursor | null,
    queryFn: async ({ pageParam }) => {
      let query = getNelcotaClient()
        .from("topup_requests")
        .select(
          "id,organization_id,amount_cents,status,cancel_reason,payment_reference,receipt_path,created_at,payment_method,provider_payment_id,provider_status,organization:organizations(name)",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(HISTORY_PAGE_SIZE);
      if (filter !== "all") {
        query = query.eq("status", filter);
      }
      if (pageParam != null) {
        query = query.or((c) => [
          c.lt("created_at", pageParam.created_at),
          c.and([c.eq("created_at", pageParam.created_at), c.lt("id", pageParam.id)]),
        ]);
      }
      const { data, error } = await query;
      if (error != null) {
        throw error;
      }
      return z.array(requestHistoryRowSchema).parse(data);
    },
    getNextPageParam: (lastPage) =>
      nextPageCursor(lastPage, HISTORY_PAGE_SIZE, (row) => ({
        created_at: row.created_at,
        id: row.id,
      })),
  });
}

/** Complete platform indicators, unaffected by organization or pending-queue page limits. */
export const platformSummaryQuery = queryOptions({
  refetchInterval: ADMIN_REFRESH_INTERVAL_IN_MS,
  queryKey: [...ADMIN_QUERY_KEY, "summary"],
  queryFn: async () => await fetchPlatformSummary(getNelcotaClient()),
});
