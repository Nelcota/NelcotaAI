import { describe, expect, test } from "bun:test";

import type { ReservedSQL } from "bun";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  configurePix,
  createOrganization,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

async function prepare(sql: ReservedSQL) {
  await configurePix(sql);
  const organizationId = await createOrganization(sql);
  const userId = await createUser(sql, organizationId);
  const attemptId = crypto.randomUUID();
  await actAs(sql, "authenticated", userId);
  const [row] = await sql`SELECT public.start_online_topup(5000, 'card', ${attemptId}::uuid) AS id`;
  if (row == null) throw new Error("request was not created");
  await actAs(sql, "service_role");
  const payload = { external_reference: row.id, transaction_amount: 50, token: "test-token" };
  await sql`SELECT public.prepare_online_payment(${row.id}, ${payload}::jsonb)`;
  return { organizationId, userId, requestId: String(row.id), payload };
}

describe("durable payment attempts", () => {
  test("returns the same request for repeated browser attempt IDs", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { userId, requestId } = await prepare(sql);
    await actAs(sql, "authenticated", userId);

    const [repeated] =
      await sql`SELECT public.start_online_topup(5000, 'card', ${requestId}::uuid) AS id`;
    const [requests] =
      await sql`SELECT count(*)::int AS count FROM public.topup_requests WHERE id = ${requestId}`;

    expect(repeated?.id).toBe(requestId);
    expect(requests?.count).toBe(1);
  });

  test("reuses an unresolved matching payment when another checkout generates a new ID", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { userId, requestId } = await prepare(sql);
    await actAs(sql, "authenticated", userId);

    const [repeated] =
      await sql`SELECT public.start_online_topup(5000, 'card', gen_random_uuid()) AS id`;

    expect(repeated?.id).toBe(requestId);
  });

  test("blocks a different amount while an external write is unresolved", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { userId } = await prepare(sql);
    await actAs(sql, "authenticated", userId);

    const state = await captureSqlState(
      sql`SELECT public.start_online_topup(6000, 'card', gen_random_uuid())`,
    );

    expect(state).toBe("P0020");
  });

  test("preserves the first payload when a retry brings a different token", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { requestId, payload } = await prepare(sql);

    await sql`SELECT public.prepare_online_payment(${requestId}, ${{ ...payload, token: "different-token" }}::jsonb)`;
    const [claimed] = await sql`SELECT public.claim_online_payment(${requestId}) AS payload`;

    expect(claimed?.payload).toEqual(payload);
  });

  test("leases a creation to one worker and makes it resumable after an uncertain outcome", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { requestId, payload } = await prepare(sql);

    const [first] = await sql`SELECT public.claim_online_payment(${requestId}) AS payload`;
    const [second] = await sql`SELECT public.claim_online_payment(${requestId}) AS payload`;
    await sql`SELECT public.release_online_payment(${requestId}, false)`;
    const [retry] = await sql`SELECT public.claim_online_payment(${requestId}) AS payload`;

    expect(first?.payload).toEqual(payload);
    expect(second?.payload).toBeNull();
    expect(retry?.payload).toEqual(payload);
  });

  test("withdraws a definite refusal and removes its retained token", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { requestId } = await prepare(sql);

    await sql`SELECT public.release_online_payment(${requestId}, true)`;
    const [request] = await sql`SELECT status FROM public.topup_requests WHERE id = ${requestId}`;
    const rows =
      await sql`SELECT request_id FROM public.online_payment_attempts WHERE request_id = ${requestId}`;

    expect(request?.status).toBe("withdrawn");
    expect(rows).toEqual([]);
  });

  test("removes the retained token after recording a recovered payment", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { requestId } = await prepare(sql);

    await sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'pending', 5000, '2026-10-01T12:00:00Z')`;
    const rows =
      await sql`SELECT request_id FROM public.online_payment_attempts WHERE request_id = ${requestId}`;

    expect(rows).toEqual([]);
  });

  test("does not expose retained payment tokens to authenticated accounts", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { userId } = await prepare(sql);
    await actAs(sql, "authenticated", userId);

    const state = await captureSqlState(sql`SELECT payload FROM public.online_payment_attempts`);

    expect(state).toBe("42501");
  });

  test("does not let the customer cancel an uncertain creation and start a duplicate", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { userId, requestId } = await prepare(sql);
    await actAs(sql, "authenticated", userId);

    const state = await captureSqlState(sql`SELECT public.cancel_my_topup(${requestId})`);

    expect(state).toBe("P0020");
  });

  test("expires abandoned requests only when no external write could have started", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const userId = await createUser(sql, organizationId);
    await sql`INSERT INTO public.topup_requests(organization_id, amount_cents, requested_by, payment_method, created_at)
      SELECT ${organizationId}, 5000, ${userId}, 'card', now() - interval '3 minutes' FROM generate_series(1,3)`;
    await actAs(sql, "authenticated", userId);

    await sql`SELECT public.start_online_topup(5000, 'card', gen_random_uuid())`;
    const [counts] =
      await sql`SELECT count(*) FILTER (WHERE status = 'withdrawn')::int AS withdrawn,
      count(*) FILTER (WHERE status = 'pending')::int AS pending FROM public.topup_requests WHERE organization_id = ${organizationId}`;

    expect(counts).toEqual({ withdrawn: 3, pending: 1 });
  });
});

describe("ordered provider observations", () => {
  test("keeps a refund warning after an older approved response arrives", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { requestId } = await prepare(sql);
    await sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'approved', 5000, '2026-10-01T12:00:00Z')`;
    await sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'refunded', 5000, '2026-10-03T12:00:00Z')`;

    await sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'approved', 5000, '2026-10-02T12:00:00Z')`;
    await actAsSuperuser(sql);
    const [request] =
      await sql`SELECT provider_status FROM public.topup_requests WHERE id = ${requestId}`;
    const [ledger] =
      await sql`SELECT count(*)::int AS count FROM public.wallet_transactions WHERE reference_id = ${requestId}`;

    expect(request?.provider_status).toBe("refunded");
    expect(ledger?.count).toBe(1);
  });

  test("rejects a stale pending observation even when the request was already confirmed", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const { requestId } = await prepare(sql);
    await sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'approved', 5000, '2026-10-03T12:00:00Z')`;

    await sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'pending', 5000, '2026-10-01T12:00:00Z')`;
    const [request] =
      await sql`SELECT provider_status FROM public.topup_requests WHERE id = ${requestId}`;

    expect(request?.provider_status).toBe("approved");
  });
});
