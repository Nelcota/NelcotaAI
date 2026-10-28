import { describe, expect, test } from "bun:test";

import {
  actAs,
  addCredit,
  captureSqlState,
  createOrganization,
  createTopupRequest,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

describe("row level security", () => {
  test("a member sees only their own organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const rows = await sql`SELECT id FROM public.organizations`;

    expect(rows).toEqual([{ id: organizationId }]);
  });

  test("a member sees only their own organization's balance", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    await addCredit(sql, organizationId, 300);
    await addCredit(sql, otherOrganizationId, 900);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const rows = await sql`
      SELECT organization_id, balance_cents::int FROM public.organization_balances`;

    expect(rows).toEqual([{ organization_id: organizationId, balance_cents: 300 }]);
  });

  test("a member cannot see another organization's transactions", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    await addCredit(sql, otherOrganizationId, 900);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const rows = await sql`SELECT id FROM public.wallet_transactions`;

    expect(rows).toEqual([]);
  });

  test("a member cannot insert into the ledger", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`
      INSERT INTO public.wallet_transactions (organization_id, type, amount_cents, description)
      VALUES (${organizationId}, 'adjustment', 100000, 'free money')`);

    expect(sqlState).toBe("42501");
  });

  test("service_role cannot update the ledger", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    await addCredit(sql, organizationId, 100);
    await actAs(sql, "service_role");

    const sqlState = await captureSqlState(
      sql`UPDATE public.wallet_transactions SET amount_cents = 999999`,
    );

    expect(sqlState).toBe("42501");
  });

  test("service_role cannot delete from the ledger", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    await addCredit(sql, organizationId, 100);
    await actAs(sql, "service_role");

    const sqlState = await captureSqlState(sql`DELETE FROM public.wallet_transactions`);

    expect(sqlState).toBe("42501");
  });

  test("a member cannot promote themselves to platform admin", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`UPDATE public.profiles SET is_platform_admin = true WHERE user_id = ${memberId}`,
    );

    expect(sqlState).toBe("42501");
  });

  test("a member cannot unblock their organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql, { status: "blocked" });
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const updated = await sql`
      UPDATE public.organizations SET status = 'active' WHERE id = ${organizationId} RETURNING id`;

    expect(updated).toEqual([]);
  });

  test("a member cannot change settings", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const updated = await sql`
      UPDATE public.settings SET pix_key = 'attacker-key' RETURNING id`;

    expect(updated).toEqual([]);
  });

  test("the platform admin sees every organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const firstOrganizationId = await createOrganization(sql);
    const secondOrganizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const rows = await sql`
      SELECT id FROM public.organizations WHERE id IN (${firstOrganizationId}, ${secondOrganizationId})`;

    expect(rows).toHaveLength(2);
  });

  test("the platform admin can block an organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const updated = await sql`
      UPDATE public.organizations SET status = 'blocked' WHERE id = ${organizationId}
      RETURNING status`;

    expect(updated).toEqual([{ status: "blocked" }]);
  });

  test("a member sees only their own organization's top-up requests", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    const ownRequestId = await createTopupRequest(sql, organizationId, 5000);
    await createTopupRequest(sql, otherOrganizationId, 9000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const rows = await sql`SELECT id FROM public.topup_requests`;

    expect(rows).toEqual([{ id: ownRequestId }]);
  });

  test("a member cannot mark their own top-up request as confirmed", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`UPDATE public.topup_requests SET status = 'confirmed', decided_at = now() WHERE id = ${requestId}`,
    );

    expect(sqlState).toBe("42501");
  });

  test("anonymous requests cannot read organizations", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await sql`SELECT set_config('role', 'anon', true)`;

    const sqlState = await captureSqlState(sql`SELECT id FROM public.organizations`);

    expect(sqlState).toBe("42501");
  });
});
