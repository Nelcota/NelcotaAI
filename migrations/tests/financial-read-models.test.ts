import { describe, expect, test } from "bun:test";

import { CNPJ } from "validation-br/cnpj";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  createOrganization,
  createTopupRequest,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

describe("financial read models", () => {
  test("finds the latest actual credit despite five newer uncredited requests", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const userId = await createUser(sql, organizationId);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    await sql`UPDATE public.topup_requests SET created_at = now() - interval '2 months', status = 'confirmed', decided_at = now() WHERE id = ${requestId}`;
    await sql`INSERT INTO public.wallet_transactions(organization_id, type, amount_cents, reference_id, description)
      VALUES (${organizationId}, 'topup', 5000, ${requestId}, 'Test credit')`;
    await sql`INSERT INTO public.topup_requests(organization_id, amount_cents, requested_by, status, decided_at, cancel_reason)
      SELECT ${organizationId}, 6000, ${userId}, 'cancelled', now(), 'Test cancellation' FROM generate_series(1,5)`;
    await actAs(sql, "authenticated", userId);

    const [row] =
      await sql`SELECT public.get_organization_topup_summary(${organizationId}) AS summary`;

    expect(row?.summary).toMatchObject({
      balance_cents: 5000,
      credited_count: 1,
      last_credit_cents: 5000,
    });
    const [dates] =
      await sql`SELECT (public.get_organization_topup_summary(${organizationId})->>'last_credit_at')::timestamptz = now() AS correct_date`;
    expect(dates?.correct_date).toBe(true);
  });

  test("attributes complete monthly credits to the ledger date instead of request creation", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const userId = await createUser(sql, organizationId);
    await sql`INSERT INTO public.topup_requests(organization_id, amount_cents, requested_by, status, decided_at, created_at)
      VALUES (${organizationId}, 5000, ${userId}, 'confirmed', '2026-10-05T12:00:00Z', '2026-09-30T12:00:00Z')`;
    await sql`INSERT INTO public.wallet_transactions(organization_id, type, amount_cents, reference_id, description, created_at)
      SELECT ${organizationId}, 'topup', 1000, gen_random_uuid(), 'Test credit', '2026-10-05T12:00:00Z' FROM generate_series(1,25)`;
    await actAs(sql, "authenticated", userId);

    const [row] =
      await sql`SELECT public.get_topup_month_totals(${organizationId}, ARRAY['2026-09-01','2026-10-01']::date[]) AS totals`;

    expect(row?.totals).toEqual([{ month: "2026-10-01", topup_cents: 25000 }]);
  });

  test("sums only credited ledger entries and excludes cancelled requests", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const userId = await createUser(sql, organizationId);
    await sql`INSERT INTO public.wallet_transactions(organization_id, type, amount_cents, reference_id, description, created_at)
      VALUES (${organizationId}, 'topup', 5000, gen_random_uuid(), 'Test credit', '2026-10-05T12:00:00Z'),
             (${organizationId}, 'topup', 1000, gen_random_uuid(), 'Test credit', '2026-10-06T12:00:00Z'),
             (${organizationId}, 'adjustment', 7000, gen_random_uuid(), 'Test adjustment', '2026-10-07T12:00:00Z')`;
    await sql`INSERT INTO public.topup_requests(organization_id, amount_cents, requested_by, status, decided_at, cancel_reason)
      VALUES (${organizationId}, 7000, ${userId}, 'cancelled', now(), 'Test cancellation')`;
    await actAs(sql, "authenticated", userId);

    const [row] =
      await sql`SELECT public.get_topup_month_totals(${organizationId}, ARRAY['2026-10-01']::date[]) AS totals`;

    expect(row?.totals).toEqual([{ month: "2026-10-01", topup_cents: 6000 }]);
  });

  test("keeps organization balances attached to their own IDs", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const first = await createOrganization(sql);
    const second = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await sql`INSERT INTO public.wallet_transactions(organization_id, type, amount_cents, reference_id, description)
      VALUES (${first}, 'topup', 5000, gen_random_uuid(), 'First credit'), (${second}, 'topup', 9000, gen_random_uuid(), 'Second credit')`;
    await actAs(sql, "authenticated", adminId);

    const rows: { id: string; balance_cents: number }[] =
      await sql`SELECT id, balance_cents::int FROM public.organization_summaries WHERE id IN (${first}::uuid, ${second}::uuid)`;
    const balances = new Map(rows.map((row) => [row.id, row.balance_cents]));

    expect(balances.get(first)).toBe(5000);
    expect(balances.get(second)).toBe(9000);
  });

  test("calculates platform indicators beyond the 500-organization and 100-request display limits", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    const beforeRows: {
      summary: {
        organization_count: number;
        active_organization_count: number;
        pending_count: number;
        pending_cents: number;
        month_topup_cents: number;
      };
    }[] = await sql`SELECT public.get_platform_topup_summary() AS summary`;
    const before = beforeRows[0];
    if (before == null) throw new Error("platform summary is missing");
    await actAsSuperuser(sql);
    const organizations = Array.from({ length: 501 }, () => {
      const prefix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`)
        .toString()
        .slice(0, 12);
      return { name: "Test organization", document: prefix + CNPJ.checksum(prefix) };
    });
    const created = await sql`INSERT INTO public.organizations(name, document)
      SELECT name, document FROM jsonb_to_recordset((${{ organizations }}::jsonb)->'organizations') AS x(name text, document text) RETURNING id`;
    const organizationId = created[0]?.id;
    if (typeof organizationId !== "string") throw new Error("organizations were not created");
    await sql`INSERT INTO public.topup_requests(organization_id, amount_cents, requested_by)
      SELECT ${organizationId}, 5000, ${adminId} FROM generate_series(1,101)`;
    await sql`INSERT INTO public.wallet_transactions(organization_id, type, amount_cents, reference_id, description)
      VALUES (${organizationId}, 'topup', 7000, gen_random_uuid(), 'Test credit')`;
    await actAs(sql, "authenticated", adminId);

    const afterRows: typeof beforeRows =
      await sql`SELECT public.get_platform_topup_summary() AS summary`;
    const after = afterRows[0];
    if (after == null) throw new Error("platform summary is missing");

    expect(after.summary.organization_count - before.summary.organization_count).toBe(501);
    expect(after.summary.active_organization_count - before.summary.active_organization_count).toBe(
      501,
    );
    expect(after.summary.pending_count - before.summary.pending_count).toBe(101);
    expect(after.summary.pending_cents - before.summary.pending_cents).toBe(505000);
    expect(after.summary.month_topup_cents - before.summary.month_topup_cents).toBe(7000);
  });

  test("does not expose another organization's summary or monthly totals", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const own = await createOrganization(sql);
    const other = await createOrganization(sql);
    const userId = await createUser(sql, own);
    await sql`INSERT INTO public.wallet_transactions(organization_id, type, amount_cents, reference_id, description, created_at)
      VALUES (${other}, 'topup', 5000, gen_random_uuid(), 'Private credit', '2026-10-01T12:00:00Z')`;
    await actAs(sql, "authenticated", userId);

    const [row] = await sql`SELECT public.get_organization_topup_summary(${other}) AS summary,
      public.get_topup_month_totals(${other}, ARRAY['2026-10-01']::date[]) AS totals`;
    const rows = await sql`SELECT id FROM public.organization_summaries WHERE id = ${other}`;

    expect(row).toEqual({ summary: null, totals: [] });
    expect(rows).toEqual([]);
  });

  test("requires an administrator for platform indicators", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const userId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", userId);

    const state = await captureSqlState(sql`SELECT public.get_platform_topup_summary()`);

    expect(state).toBe("42501");
  });

  test("retrieves every tied timestamp using a compound cursor", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const userId = await createUser(sql, organizationId);
    await sql`INSERT INTO public.topup_requests(organization_id, amount_cents, requested_by)
      SELECT ${organizationId}, 5000, ${userId} FROM generate_series(1,21)`;
    await actAs(sql, "authenticated", userId);
    const first =
      await sql`SELECT id, created_at::text FROM public.topup_requests WHERE organization_id = ${organizationId}
      ORDER BY created_at DESC, id DESC LIMIT 20`;
    const cursor = first.at(-1);
    if (cursor == null) throw new Error("first page is empty");

    const second =
      await sql`SELECT id FROM public.topup_requests WHERE organization_id = ${organizationId}
      AND (created_at < ${cursor.created_at}::timestamptz OR (created_at = ${cursor.created_at}::timestamptz AND id < ${cursor.id}::uuid))
      ORDER BY created_at DESC, id DESC LIMIT 20`;

    expect(first.length + second.length).toBe(21);
    expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(21);
  });
});
