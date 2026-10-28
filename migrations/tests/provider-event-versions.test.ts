import { describe, expect, test } from "bun:test";

import type { ReservedSQL } from "bun";

import {
  actAs,
  actAsSuperuser,
  configurePix,
  createOrganization,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

async function request(sql: ReservedSQL) {
  await configurePix(sql);
  const organizationId = await createOrganization(sql);
  const userId = await createUser(sql, organizationId);
  await actAs(sql, "authenticated", userId);
  const [row] = await sql`SELECT public.start_online_topup(5000, 'card') AS id`;
  if (row == null) throw new Error("request missing");
  await actAs(sql, "service_role");
  return String(row.id);
}

describe("provider event versions", () => {
  test("credits a provider approval after an untimestamped pending observation", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const id = await request(sql);
    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'pending', 5000)`;
    const [before] =
      await sql`SELECT provider_updated_at FROM public.topup_requests WHERE id = ${id}`;

    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'approved', 5000, '2026-10-01T12:00:00Z')`;
    await actAsSuperuser(sql);
    const [after] =
      await sql`SELECT status, provider_status, (SELECT count(*)::int FROM public.wallet_transactions WHERE reference_id = ${id}) AS credits
      FROM public.topup_requests WHERE id = ${id}`;

    expect(before?.provider_updated_at).toBeNull();
    expect(after).toEqual({ status: "confirmed", provider_status: "approved", credits: 1 });
  });

  test("does not advance a known provider version using an untimestamped observation", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const id = await request(sql);
    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'pending', 5000, '2026-10-01T12:00:00Z')`;

    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'pending', 5000)`;
    const [row] =
      await sql`SELECT provider_updated_at = '2026-10-01T12:00:00Z'::timestamptz AS unchanged FROM public.topup_requests WHERE id = ${id}`;

    expect(row?.unchanged).toBe(true);
  });

  test("keeps approval terminal when a pending response has no version", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const id = await request(sql);
    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'approved', 5000, '2026-10-01T12:00:00Z')`;

    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'pending', 5000)`;
    const [row] =
      await sql`SELECT status, provider_status FROM public.topup_requests WHERE id = ${id}`;

    expect(row).toEqual({ status: "confirmed", provider_status: "approved" });
  });

  test("preserves a refund warning when an approval has no version", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const id = await request(sql);
    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'approved', 5000, '2026-10-01T12:00:00Z')`;
    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'refunded', 5000, '2026-10-02T12:00:00Z')`;

    await sql`SELECT public.apply_mercado_pago_status(${id}, '123', 'approved', 5000)`;
    const [row] = await sql`SELECT provider_status FROM public.topup_requests WHERE id = ${id}`;

    expect(row?.provider_status).toBe("refunded");
  });
});
