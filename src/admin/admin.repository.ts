import type { NelcotaClient } from "@nelcota/client";
import { z } from "zod";

import type { Database } from "@/shared/database";
import { collectPages } from "@/shared/pagination";

import { organizationSummarySchema, platformSummarySchema } from "./admin.schemas";

const ORGANIZATIONS_PAGE_SIZE = 500;
/** Columns of `organization_summaries` read by every admin lookup. */
export const ORGANIZATION_SUMMARY_COLUMNS =
  "id,name,document,status,created_at,balance_cents,month_topup_cents";

/** Reads every joined organization/balance page before applying the customer lookup's display order. */
export async function fetchOrganizations(client: NelcotaClient<Database>) {
  const rows = await collectPages(
    async (cursor: string | null) => {
      let query = client
        .from("organization_summaries")
        .select(ORGANIZATION_SUMMARY_COLUMNS)
        .order("id")
        .limit(ORGANIZATIONS_PAGE_SIZE);
      if (cursor != null) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error != null) throw error;
      return z
        .array(organizationSummarySchema)
        .parse(data)
        .map((row) => ({
          id: row.id,
          name: row.name,
          document: row.document,
          status: row.status,
          balanceCents: row.balance_cents,
          monthTopupCents: row.month_topup_cents,
        }));
    },
    (row) => row.id,
    ORGANIZATIONS_PAGE_SIZE,
  );
  return rows.toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Reads complete platform indicators independently of the administrator queue page. */
export async function fetchPlatformSummary(client: NelcotaClient<Database>) {
  const { data, error } = await client.rpc("get_platform_topup_summary", {});
  if (error != null) throw error;
  return platformSummarySchema.parse(data);
}
