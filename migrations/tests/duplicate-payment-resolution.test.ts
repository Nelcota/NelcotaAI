import { expect, test } from "bun:test";

import type { ReservedSQL } from "bun";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  configurePix,
  createOrganization,
  createUser,
  openRollbackTransaction,
  readBalanceInCents,
} from "./database.fixtures";

async function fixture(sql: ReservedSQL, differentOrganizations = false) {
  await configurePix(sql);
  const organizationId = await createOrganization(sql);
  const customer = await createUser(sql, organizationId);
  const manualOrganizationId = differentOrganizations
    ? await createOrganization(sql)
    : organizationId;
  const manualCustomer = differentOrganizations
    ? await createUser(sql, manualOrganizationId)
    : customer;
  const admin = await createUser(sql, null, { isPlatformAdmin: true });
  await actAs(sql, "authenticated", customer);
  const [online] =
    await sql`SELECT public.start_online_topup(5000, 'card', ${crypto.randomUUID()}) AS id`;
  await actAs(sql, "authenticated", manualCustomer);
  const [manual] = await sql`SELECT public.request_topup(5000) AS id`;
  if (online == null || manual == null) throw new Error("fixture request missing");
  await actAs(sql, "service_role");
  const payload = {
    external_reference: String(online.id),
    transaction_amount: 50,
    token: "test-token",
  };
  await sql`SELECT public.prepare_online_payment(${online.id}, ${payload}::jsonb)`;
  await sql`SELECT public.claim_online_payment(${online.id})`;
  await actAs(sql, "authenticated", admin);
  await sql`SELECT public.admin_confirm_topup(${manual.id}, '123456789')`;
  await actAs(sql, "service_role");
  return {
    organizationId,
    manualOrganizationId,
    customer,
    onlineId: String(online.id),
    manualId: String(manual.id),
  };
}

test("commits duplicate identity, closes the request and removes its leased card payload", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const data = await fixture(sql);

  const [result] =
    await sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'approved', 5000) AS status`;
  await actAsSuperuser(sql);
  const [request] =
    await sql`SELECT status, provider_payment_id, provider_status, duplicate_of_request_id, decided_at IS NOT NULL AS decided, EXISTS (SELECT 1 FROM public.online_payment_attempts WHERE request_id = ${data.onlineId}) AS payload_retained FROM public.topup_requests WHERE id = ${data.onlineId}`;

  expect(result?.status).toBe("cancelled");
  expect(request).toEqual({
    status: "cancelled",
    provider_payment_id: "123456789",
    provider_status: "approved",
    duplicate_of_request_id: data.manualId,
    decided: true,
    payload_retained: false,
  });
  expect(await readBalanceInCents(sql, data.organizationId)).toBe(5000);
});

test("allows new top-ups of the same and different amounts after resolving a duplicate", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const data = await fixture(sql);
  await sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'approved', 5000)`;
  await actAs(sql, "authenticated", data.customer);
  const sameAttempt = crypto.randomUUID();
  const differentAttempt = crypto.randomUUID();

  const [same] = await sql`SELECT public.start_online_topup(5000, 'card', ${sameAttempt}) AS id`;
  const [different] =
    await sql`SELECT public.start_online_topup(6000, 'card', ${differentAttempt}) AS id`;
  const withdrawal = await captureSqlState(sql`SELECT public.cancel_my_topup(${data.onlineId})`);

  expect(same?.id).toBe(sameAttempt);
  expect(different?.id).toBe(differentAttempt);
  expect(withdrawal).toBe("P0014");
});

test("does not move an existing credit across organizations when resolving the conflict", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const data = await fixture(sql, true);

  await sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'approved', 5000)`;
  await actAsSuperuser(sql);
  const [request] =
    await sql`SELECT status, duplicate_of_request_id FROM public.topup_requests WHERE id = ${data.onlineId}`;

  expect(request).toEqual({ status: "cancelled", duplicate_of_request_id: data.manualId });
  expect(await readBalanceInCents(sql, data.organizationId)).toBe(0);
  expect(await readBalanceInCents(sql, data.manualOrganizationId)).toBe(5000);
});

test("replayed approvals and later refunds preserve the duplicate link and original credit", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const data = await fixture(sql);
  await actAsSuperuser(sql);
  const before =
    await sql`SELECT id, amount_cents, reference_id, created_at FROM public.wallet_transactions WHERE organization_id = ${data.organizationId}`;
  await actAs(sql, "service_role");
  await sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'approved', 5000, '2026-10-28T12:00:00Z')`;

  await sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'approved', 5000, '2026-10-28T12:01:00Z')`;
  await sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'refunded', 5000, '2026-10-28T12:02:00Z')`;
  await actAsSuperuser(sql);
  const after =
    await sql`SELECT id, amount_cents, reference_id, created_at FROM public.wallet_transactions WHERE organization_id = ${data.organizationId}`;
  const [request] =
    await sql`SELECT status, provider_status, duplicate_of_request_id FROM public.topup_requests WHERE id = ${data.onlineId}`;

  expect(after).toEqual(before);
  expect(request).toEqual({
    status: "cancelled",
    provider_status: "refunded",
    duplicate_of_request_id: data.manualId,
  });
});

test("retains recovery data when the observed amount does not match the request", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const data = await fixture(sql);
  await sql`SAVEPOINT invalid_amount`;

  const state = await captureSqlState(
    sql`SELECT public.apply_mercado_pago_status(${data.onlineId}, '123456789', 'approved', 4000)`,
  );
  await sql`ROLLBACK TO invalid_amount`;
  const [request] =
    await sql`SELECT status, provider_payment_id, EXISTS (SELECT 1 FROM public.online_payment_attempts WHERE request_id = ${data.onlineId}) AS payload_retained FROM public.topup_requests WHERE id = ${data.onlineId}`;

  expect(state).toBe("22023");
  expect(request).toEqual({ status: "pending", provider_payment_id: null, payload_retained: true });
});

test("does not expose the internal reference lookup to authenticated callers", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const data = await fixture(sql);
  await actAs(sql, "authenticated", data.customer);

  const state = await captureSqlState(
    sql`SELECT internal.find_other_topup_payment('123456789', ${data.onlineId})`,
  );

  expect(state).toBe("42501");
});
