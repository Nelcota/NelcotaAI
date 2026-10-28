import { describe, expect, test } from "bun:test";

import type { ReservedSQL } from "bun";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  configurePix,
  createOrganization,
  createTopupRequest,
  createUser,
  openRollbackTransaction,
  readBalanceInCents,
} from "./database.fixtures";

async function startOnlineTopup(
  sql: ReservedSQL,
  userId: string,
  amountInCents: number,
  method: "pix" | "card",
): Promise<string> {
  await actAs(sql, "authenticated", userId);
  const rows: { id: string }[] = await sql`
    SELECT public.start_online_topup(${amountInCents}, ${method}::public.topup_payment_method) AS id`;
  await actAsSuperuser(sql);
  const row = rows[0];
  if (row == null) {
    throw new Error("start_online_topup returned no row");
  }
  return row.id;
}

async function applyStatus(
  sql: ReservedSQL,
  requestId: string,
  paymentId: string,
  status: string,
  amountInCents: number,
): Promise<string> {
  await actAs(sql, "service_role");
  const rows: { status: string }[] = await sql`
    SELECT public.apply_mercado_pago_status(${requestId}, ${paymentId}, ${status}, ${amountInCents})::text
      AS status`;
  await actAsSuperuser(sql);
  return rows[0]?.status ?? "";
}

describe("start_online_topup", () => {
  test("creates a pending request with the chosen method", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);

    const requestId = await startOnlineTopup(sql, memberId, 5000, "card");

    const [request] = await sql`
      SELECT status, payment_method, amount_cents::int AS amount_cents, organization_id
      FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({
      status: "pending",
      payment_method: "card",
      amount_cents: 5000,
      organization_id: organizationId,
    });
  });

  test("fails with 22023 for the manual pix method", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.start_online_topup(5000, 'manual_pix')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 below the minimum amount", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.start_online_topup(100, 'pix')`);

    expect(sqlState).toBe("22023");
  });

  test("fails with P0010 for a blocked organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql, { status: "blocked" });
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.start_online_topup(5000, 'pix')`);

    expect(sqlState).toBe("P0010");
  });

  test("closes expired Pix codes so they do not count against the pending limit", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const expiredIds = [
      await startOnlineTopup(sql, memberId, 5000, "pix"),
      await startOnlineTopup(sql, memberId, 5000, "pix"),
      await startOnlineTopup(sql, memberId, 5000, "pix"),
    ];
    await sql`
      UPDATE public.topup_requests SET pix_expires_at = now() - interval '1 minute'
      WHERE id IN ${sql(expiredIds)}`;

    await startOnlineTopup(sql, memberId, 5000, "pix");

    const rows = await sql`
      SELECT count(*)::int AS count FROM public.topup_requests
      WHERE id IN ${sql(expiredIds)} AND status = 'cancelled'`;
    expect(rows[0]).toEqual({ count: 3 });
  });

  test("fails with P0015 when three requests are still pending", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await startOnlineTopup(sql, memberId, 5000, "pix");
    await startOnlineTopup(sql, memberId, 5000, "pix");
    await startOnlineTopup(sql, memberId, 5000, "card");
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.start_online_topup(5000, 'pix')`);

    expect(sqlState).toBe("P0015");
  });
});

describe("record_mercado_pago_payment", () => {
  test("stores the payment id and the Pix code", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await actAs(sql, "service_role");

    await sql`
      SELECT public.record_mercado_pago_payment(${requestId}, '123', '00020126pix', now())`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT provider_payment_id, pix_qr_code FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({ provider_payment_id: "123", pix_qr_code: "00020126pix" });
  });

  test("fails with P0019 when the request already has another payment", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await actAs(sql, "service_role");
    await sql`SELECT public.record_mercado_pago_payment(${requestId}, '123', NULL, NULL)`;

    const sqlState = await captureSqlState(
      sql`SELECT public.record_mercado_pago_payment(${requestId}, '456', NULL, NULL)`,
    );

    expect(sqlState).toBe("P0019");
  });

  test("is not executable by customers", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.record_mercado_pago_payment(${requestId}, '123', NULL, NULL)`,
    );

    expect(sqlState).toBe("42501");
  });
});

describe("apply_mercado_pago_status", () => {
  test("credits the organization once when the payment is approved", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");

    const first = await applyStatus(sql, requestId, "123", "approved", 5000);
    const second = await applyStatus(sql, requestId, "123", "approved", 5000);

    expect([first, second]).toEqual(["confirmed", "confirmed"]);
    expect(await readBalanceInCents(sql, organizationId)).toBe(5000);
  });

  test("describes a card top-up in the ledger", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "card");

    await applyStatus(sql, requestId, "123", "approved", 5000);

    const [entry] = await sql`
      SELECT description FROM public.wallet_transactions WHERE reference_id = ${requestId}`;
    expect(entry).toEqual({ description: "Recarga via cartão de crédito" });
  });

  test("still credits a Pix paid after the customer withdrew it", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await actAs(sql, "authenticated", memberId);
    await sql`SELECT public.cancel_my_topup(${requestId})`;
    await actAsSuperuser(sql);

    const status = await applyStatus(sql, requestId, "123", "approved", 5000);

    expect(status).toBe("confirmed");
    expect(await readBalanceInCents(sql, organizationId)).toBe(5000);
  });

  test("closes a pending card request that was rejected", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "card");

    const status = await applyStatus(sql, requestId, "123", "rejected", 5000);

    const [request] = await sql`
      SELECT cancel_reason FROM public.topup_requests WHERE id = ${requestId}`;
    expect(status).toBe("cancelled");
    expect(request).toEqual({ cancel_reason: "O pagamento com cartão não foi aprovado." });
    expect(await readBalanceInCents(sql, organizationId)).toBe(0);
  });

  test("keeps the request pending while the payment is in process", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "card");

    const status = await applyStatus(sql, requestId, "123", "in_process", 5000);

    expect(status).toBe("pending");
  });

  test("fails with 22023 when the approved amount differs from the request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await actAs(sql, "service_role");

    const sqlState = await captureSqlState(
      sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'approved', 4000)`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with P0019 for a different payment id", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await applyStatus(sql, requestId, "123", "pending", 5000);
    await actAs(sql, "service_role");

    const sqlState = await captureSqlState(
      sql`SELECT public.apply_mercado_pago_status(${requestId}, '456', 'approved', 5000)`,
    );

    expect(sqlState).toBe("P0019");
  });

  test("fails with P0014 for a manual pix request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    await actAs(sql, "service_role");

    const sqlState = await captureSqlState(
      sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'approved', 5000)`,
    );

    expect(sqlState).toBe("P0014");
  });

  test("fails with P0002 for an unknown request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await actAs(sql, "service_role");

    const sqlState = await captureSqlState(
      sql`SELECT public.apply_mercado_pago_status(gen_random_uuid(), '123', 'approved', 5000)`,
    );

    expect(sqlState).toBe("P0002");
  });

  test("is not executable by customers", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const requestId = await startOnlineTopup(sql, memberId, 5000, "pix");
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.apply_mercado_pago_status(${requestId}, '123', 'approved', 5000)`,
    );

    expect(sqlState).toBe("42501");
  });
});
