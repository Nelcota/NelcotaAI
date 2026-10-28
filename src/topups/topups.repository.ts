import type { NelcotaClient } from "@nelcota/client";
import { z } from "zod";

import type { Database } from "@/shared/database";
import { getNelcotaClient } from "@/shared/nelcota";
import { collectPages, type CreatedAtCursor } from "@/shared/pagination";

import { topupRequestSchema } from "./topups.schemas";

type TopupRequest = z.infer<typeof topupRequestSchema>;
/** A status filter shared by history and complete exports. */
export type HistoryFilter = "all" | TopupRequest["status"];

const COLUMNS =
  "id,amount_cents,status,cancel_reason,receipt_path,created_at,decided_at,payment_method,pix_qr_code,pix_expires_at";
const EXPORT_PAGE_SIZE = 1000;

/** Uses an identical compound cursor for on-screen history and CSV pages. */
export async function fetchRequestPage(
  organizationId: string,
  filter: HistoryFilter,
  cursor: CreatedAtCursor | null,
  pageSize: number,
  client = getNelcotaClient(),
) {
  let query = client
    .from("topup_requests")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize);
  if (filter !== "all") query = query.eq("status", filter);
  if (cursor != null)
    query = query.or((c) => [
      c.lt("created_at", cursor.created_at),
      c.and([c.eq("created_at", cursor.created_at), c.lt("id", cursor.id)]),
    ]);
  const { data, error } = await query;
  if (error != null) throw error;
  return z.array(topupRequestSchema).parse(data);
}

/** Exports every matching request, including all pages beyond the API's 1000-row limit. */
export async function fetchRequestsForExport(
  organizationId: string,
  filter: HistoryFilter,
  client: NelcotaClient<Database> = getNelcotaClient(),
) {
  return await collectPages(
    (cursor: CreatedAtCursor | null) =>
      fetchRequestPage(organizationId, filter, cursor, EXPORT_PAGE_SIZE, client),
    (row) => ({ created_at: row.created_at, id: row.id }),
    EXPORT_PAGE_SIZE,
  );
}

export async function readPendingRequests(organizationId: string, client = getNelcotaClient()) {
  const { data, error } = await client
    .from("topup_requests")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error != null) throw error;
  return z.array(topupRequestSchema).parse(data);
}
