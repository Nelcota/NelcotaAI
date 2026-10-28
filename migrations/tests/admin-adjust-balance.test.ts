import { describe, expect, test } from "bun:test";

import {
  actAs,
  actAsSuperuser,
  addCredit,
  captureSqlState,
  createOrganization,
  createUser,
  openRollbackTransaction,
  readBalanceInCents,
} from "./database.fixtures";

describe("admin_adjust_balance", () => {
  test("adds credit and records the admin as author", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const [result] = await sql`
      SELECT public.admin_adjust_balance(${organizationId}, 1500, '  Bônus de boas-vindas ') AS id`;

    await actAsSuperuser(sql);
    const [row] = await sql`
      SELECT type, amount_cents::int, description, created_by
      FROM public.wallet_transactions WHERE id = ${result.id}`;
    expect(row).toEqual({
      type: "adjustment",
      amount_cents: 1500,
      description: "Bônus de boas-vindas",
      created_by: adminId,
    });
    expect(await readBalanceInCents(sql, organizationId)).toBe(1500);
  });

  test("removes credit when the amount is negative", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await addCredit(sql, organizationId, 1000);
    await actAs(sql, "authenticated", adminId);

    await sql`SELECT public.admin_adjust_balance(${organizationId}, -400, 'Correção')`;

    expect(await readBalanceInCents(sql, organizationId)).toBe(600);
  });

  test("fails with P0012 when the adjustment would leave a negative balance", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await addCredit(sql, organizationId, 100);
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_adjust_balance(${organizationId}, -101, 'Correção')`,
    );

    expect(sqlState).toBe("P0012");
  });

  test("fails with 42501 when the caller is not a platform admin", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_adjust_balance(${organizationId}, 1500, 'Tentativa')`,
    );

    expect(sqlState).toBe("42501");
  });

  test("fails with 22023 when the description is blank", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_adjust_balance(${organizationId}, 1500, '   ')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when the amount is zero", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_adjust_balance(${organizationId}, 0, 'Nada')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when the amount exceeds the maximum adjustment", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_adjust_balance(${organizationId}, 100000001, 'Erro de digitação')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with P0002 when the organization does not exist", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_adjust_balance(gen_random_uuid(), 1500, 'Bônus')`,
    );

    expect(sqlState).toBe("P0002");
  });
});
