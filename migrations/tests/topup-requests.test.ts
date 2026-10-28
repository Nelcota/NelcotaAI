import { describe, expect, test } from "bun:test";

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

describe("request_topup", () => {
  test("creates a pending request for the caller's organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const [created] = await sql`SELECT public.request_topup(5000) AS id`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT organization_id, amount_cents::int, status, requested_by
      FROM public.topup_requests WHERE id = ${created.id}`;
    expect(request).toEqual({
      organization_id: organizationId,
      amount_cents: 5000,
      status: "pending",
      requested_by: memberId,
    });
  });

  test("does not change the balance before confirmation", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    await sql`SELECT public.request_topup(5000)`;

    await actAsSuperuser(sql);
    expect(await readBalanceInCents(sql, organizationId)).toBe(0);
  });

  test("accepts exactly the minimum amount", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const [created] = await sql`SELECT public.request_topup(2000) AS id`;

    expect(typeof created.id).toBe("string");
  });

  test("fails with 22023 when the amount is below the minimum", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(1999)`);

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when the amount is above the maximum", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(500001)`);

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when the amount is negative", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(-5000)`);

    expect(sqlState).toBe("22023");
  });

  test("fails with P0016 while the Pix data is not configured", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await sql`UPDATE public.settings SET pix_key = NULL, pix_receiver_name = NULL, pix_city = NULL`;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(5000)`);

    expect(sqlState).toBe("P0016");
  });

  test("fails with P0010 when the organization is blocked", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql, { status: "blocked" });
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(5000)`);

    expect(sqlState).toBe("P0010");
  });

  test("fails with P0015 when three requests are already pending", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const organizationId = await createOrganization(sql);
    await createTopupRequest(sql, organizationId, 5000);
    await createTopupRequest(sql, organizationId, 5000);
    await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(5000)`);

    expect(sqlState).toBe("P0015");
  });

  test("fails with 42501 when the caller has no organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await configurePix(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(sql`SELECT public.request_topup(5000)`);

    expect(sqlState).toBe("42501");
  });
});

describe("admin_confirm_topup", () => {
  test("confirms the request and credits the organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const [result] = await sql`SELECT public.admin_confirm_topup(${requestId}) AS credited`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT status, decided_by FROM public.topup_requests WHERE id = ${requestId}`;
    expect(result).toEqual({ credited: true });
    expect(request).toEqual({ status: "confirmed", decided_by: adminId });
    expect(await readBalanceInCents(sql, organizationId)).toBe(5000);
  });

  test("credits only once when confirmed twice", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    await sql`SELECT public.admin_confirm_topup(${requestId})`;

    const [secondResult] = await sql`SELECT public.admin_confirm_topup(${requestId}) AS credited`;

    await actAsSuperuser(sql);
    expect(secondResult).toEqual({ credited: false });
    expect(await readBalanceInCents(sql, organizationId)).toBe(5000);
  });

  test("fails with P0014 when the request was cancelled", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    await sql`SELECT public.admin_cancel_topup(${requestId}, 'Pagamento não encontrado')`;

    const sqlState = await captureSqlState(sql`SELECT public.admin_confirm_topup(${requestId})`);

    expect(sqlState).toBe("P0014");
  });

  test("fails with P0002 when the request does not exist", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_confirm_topup(gen_random_uuid())`,
    );

    expect(sqlState).toBe("P0002");
  });

  test("fails with 42501 when a member tries to confirm their own request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.admin_confirm_topup(${requestId})`);

    expect(sqlState).toBe("42501");
  });
});

describe("admin_cancel_topup", () => {
  test("cancels a pending request with the trimmed reason", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    await sql`SELECT public.admin_cancel_topup(${requestId}, '  Pix não recebido ')`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT status, cancel_reason FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({ status: "cancelled", cancel_reason: "Pix não recebido" });
    expect(await readBalanceInCents(sql, organizationId)).toBe(0);
  });

  test("fails with 22023 when the reason is blank", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_cancel_topup(${requestId}, '   ')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with P0014 when the request was already confirmed", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    await sql`SELECT public.admin_confirm_topup(${requestId})`;

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_cancel_topup(${requestId}, 'Tarde demais')`,
    );

    expect(sqlState).toBe("P0014");
  });

  test("fails with 42501 when the caller is not a platform admin", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_cancel_topup(${requestId}, 'Mudei de ideia')`,
    );

    expect(sqlState).toBe("42501");
  });
});

describe("get_monthly_topups", () => {
  test("returns one row per month with the caller's confirmed top-ups", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const otherRequestId = await createTopupRequest(sql, otherOrganizationId, 9000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    await sql`SELECT public.admin_confirm_topup(${requestId})`;
    await sql`SELECT public.admin_confirm_topup(${otherRequestId})`;
    await actAsSuperuser(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const rows = await sql`SELECT month::text, topup_cents::int FROM public.get_monthly_topups(3)`;

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ topup_cents: 0 });
    expect(rows[2]).toMatchObject({ topup_cents: 5000 });
  });

  test("fails with 22023 when months is zero", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT * FROM public.get_monthly_topups(0)`);

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when months is above 36", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT * FROM public.get_monthly_topups(37)`);

    expect(sqlState).toBe("22023");
  });
});

describe("admin_link_user", () => {
  test("links an existing account to an organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const [account] = await sql`
      INSERT INTO auth.users (email) VALUES ('nova.cliente@example.com') RETURNING id`;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    await sql`
      SELECT public.admin_link_user(' Nova.Cliente@Example.com ', ${organizationId}, ' Maria ')`;

    await actAsSuperuser(sql);
    const [profile] = await sql`
      SELECT organization_id, name, is_platform_admin FROM public.profiles
      WHERE user_id = ${account.id}`;
    expect(profile).toEqual({
      organization_id: organizationId,
      name: "Maria",
      is_platform_admin: false,
    });
  });

  test("fails with P0002 when no account has the e-mail", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_link_user('ninguem@example.com', ${organizationId}, 'Ninguém')`,
    );

    expect(sqlState).toBe("P0002");
  });

  test("fails with P0014 when the account is already linked", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const [member] = await sql`SELECT email FROM auth.users WHERE id = ${memberId}`;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_link_user(${member.email}, ${otherOrganizationId}, 'Outra')`,
    );

    expect(sqlState).toBe("P0014");
  });

  test("fails with 42501 when the caller is not a platform admin", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_link_user('alguem@example.com', ${organizationId}, 'Alguém')`,
    );

    expect(sqlState).toBe("42501");
  });
});
