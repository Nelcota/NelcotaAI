import { describe, expect, test } from "bun:test";

import { SQL, type ReservedSQL } from "bun";

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

async function setup(sql: ReservedSQL) {
  await configurePix(sql);
  const organizationId = await createOrganization(sql);
  const customer = await createUser(sql, organizationId);
  const admin = await createUser(sql, null, { isPlatformAdmin: true });
  await actAs(sql, "authenticated", customer);
  const [online] = await sql`SELECT public.start_online_topup(5000, 'card') AS id`;
  const [manual] = await sql`SELECT public.request_topup(5000) AS id`;
  if (online == null || manual == null) throw new Error("request missing");
  return {
    organizationId,
    customer,
    admin,
    onlineId: String(online.id),
    manualId: String(manual.id),
  };
}

async function duplicateState(sql: ReservedSQL, operation: () => Promise<unknown>) {
  await sql`SAVEPOINT duplicate_payment`;
  const state = await captureSqlState(operation());
  await sql`ROLLBACK TO SAVEPOINT duplicate_payment`;
  return state;
}

describe("shared payment credit identity", () => {
  test("rejects a manual confirmation using an already credited provider payment", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const fixture = await setup(sql);
    await actAs(sql, "service_role");
    await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, '123456789', 'approved', 5000)`;
    await actAs(sql, "authenticated", fixture.admin);

    const state = await duplicateState(
      sql,
      async () =>
        await sql`SELECT public.admin_confirm_topup(${fixture.manualId}, '  123456789  ')`,
    );
    await actAsSuperuser(sql);

    expect(state).toBe("P0017");
    expect(await readBalanceInCents(sql, fixture.organizationId)).toBe(5000);
  });

  test("closes the duplicate provider request after manual confirmation wins", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const fixture = await setup(sql);
    await actAs(sql, "authenticated", fixture.admin);
    await sql`SELECT public.admin_confirm_topup(${fixture.manualId}, '123456789')`;
    await actAs(sql, "service_role");

    const [result] =
      await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, '123456789', 'approved', 5000) AS status`;
    await actAsSuperuser(sql);
    const [request] =
      await sql`SELECT provider_payment_id, duplicate_of_request_id FROM public.topup_requests WHERE id = ${fixture.onlineId}`;

    expect(result?.status).toBe("cancelled");
    expect(request).toEqual({
      provider_payment_id: "123456789",
      duplicate_of_request_id: fixture.manualId,
    });
    expect(await readBalanceInCents(sql, fixture.organizationId)).toBe(5000);
  });

  test("does not allow manual confirmation to bypass online reconciliation", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const fixture = await setup(sql);
    await actAs(sql, "authenticated", fixture.admin);

    const state = await captureSqlState(
      sql`SELECT public.admin_confirm_topup(${fixture.onlineId})`,
    );

    expect(state).toBe("P0014");
  });

  test("concurrent manual and automatic credits share one payment identity", async () => {
    const url = process.env["DATABASE_URL"];
    if (url == null) throw new Error("DATABASE_URL missing");
    await using database = new SQL(url);
    const fixture = await database.begin(async (sql) => {
      const organizationId = await createOrganization(sql);
      const admin = await createUser(sql, null, { isPlatformAdmin: true });
      const manualId = await createTopupRequest(sql, organizationId, 5000);
      const onlineId = await createTopupRequest(sql, organizationId, 5000);
      await sql`UPDATE public.topup_requests SET payment_method = 'card' WHERE id = ${onlineId}`;
      return { organizationId, admin, manualId, onlineId };
    });
    await using cleanup = {
      organizationId: fixture.organizationId,
      async [Symbol.asyncDispose]() {
        await database.begin(async (sql) => {
          await sql`DELETE FROM public.wallet_transactions WHERE organization_id = ${fixture.organizationId}`;
          await sql`DELETE FROM public.topup_requests WHERE organization_id = ${fixture.organizationId}`;
          await sql`DELETE FROM public.profiles WHERE user_id = ${fixture.admin}`;
          await sql`DELETE FROM auth.users WHERE id = ${fixture.admin}`;
          await sql`DELETE FROM public.organizations WHERE id = ${fixture.organizationId}`;
        });
      },
    };
    const reference = crypto.randomUUID().replaceAll("-", "");

    const results = await Promise.allSettled([
      database.begin(async (sql) => {
        await actAs(sql, "authenticated", fixture.admin);
        return await sql`SELECT public.admin_confirm_topup(${fixture.manualId}, ${reference})`;
      }),
      database.begin(async (sql) => {
        await actAs(sql, "service_role");
        return await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, ${reference}, 'approved', 5000)`;
      }),
    ]);
    const [balance] =
      await database`SELECT balance_cents::int AS cents FROM public.organization_balances WHERE organization_id = ${cleanup.organizationId}`;
    const [online] =
      await database`SELECT status, duplicate_of_request_id FROM public.topup_requests WHERE id = ${fixture.onlineId}`;
    const [credits] =
      await database`SELECT count(*)::int AS count FROM public.wallet_transactions WHERE organization_id = ${cleanup.organizationId} AND type = 'topup'`;

    expect(results[1]?.status).toBe("fulfilled");
    if (results[0]?.status === "fulfilled") {
      expect(online).toEqual({ status: "cancelled", duplicate_of_request_id: fixture.manualId });
    } else {
      const reason: unknown = results[0]?.reason;
      expect(reason instanceof SQL.PostgresError ? reason.errno : null).toBe("P0017");
      expect(online).toEqual({ status: "confirmed", duplicate_of_request_id: null });
    }
    expect(credits?.count).toBe(1);
    expect(balance?.cents).toBe(5000);
  });
});

describe("uncredited payment reversals", () => {
  test.each(["refunded", "charged_back"])(
    "closes a first-seen %s without consuming the pending quota",
    async (status) => {
      await using transaction = await openRollbackTransaction();
      const { sql } = transaction;
      const fixture = await setup(sql);
      await actAs(sql, "service_role");

      const [result] =
        await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, '123456789', ${status}, 5000) AS status`;
      await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, '123456789', 'approved', 5000)`;
      await actAsSuperuser(sql);
      const [request] =
        await sql`SELECT status, provider_status, decided_at IS NOT NULL AS decided FROM public.topup_requests WHERE id = ${fixture.onlineId}`;
      const balance = await readBalanceInCents(sql, fixture.organizationId);
      await actAs(sql, "authenticated", fixture.customer);
      const newRequest = await sql`SELECT public.start_online_topup(5000, 'card') AS id`;

      expect(result?.status).toBe("cancelled");
      expect(request).toEqual({ status: "cancelled", provider_status: status, decided: true });
      expect(balance).toBe(0);
      expect(newRequest[0]?.id).toBeString();
    },
  );

  test("preserves confirmed credit and the reversal warning for administrator review", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const fixture = await setup(sql);
    await actAs(sql, "service_role");
    await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, '123456789', 'approved', 5000)`;

    await sql`SELECT public.apply_mercado_pago_status(${fixture.onlineId}, '123456789', 'refunded', 5000)`;
    await actAsSuperuser(sql);
    const [request] =
      await sql`SELECT status, provider_status FROM public.topup_requests WHERE id = ${fixture.onlineId}`;

    expect(request).toEqual({ status: "confirmed", provider_status: "refunded" });
    expect(await readBalanceInCents(sql, fixture.organizationId)).toBe(5000);
  });

  test("migration closes historical uncredited reversals without changing ledger records", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const fixture = await setup(sql);
    await actAsSuperuser(sql);
    await sql`UPDATE public.topup_requests SET provider_payment_id = '123456789', provider_status = 'refunded' WHERE id = ${fixture.onlineId}`;
    const before =
      await sql`SELECT id, amount_cents, reference_id, created_at FROM public.wallet_transactions WHERE organization_id = ${fixture.organizationId}`;

    await sql.unsafe(
      await Bun.file(new URL("../V16__payment_credit_consistency.sql", import.meta.url)).text(),
    );
    const after =
      await sql`SELECT id, amount_cents, reference_id, created_at FROM public.wallet_transactions WHERE organization_id = ${fixture.organizationId}`;
    const [request] =
      await sql`SELECT status, provider_status FROM public.topup_requests WHERE id = ${fixture.onlineId}`;

    expect(after).toEqual(before);
    expect(request).toEqual({ status: "cancelled", provider_status: "refunded" });
  });
});
