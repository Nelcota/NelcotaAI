import { describe, expect, test } from "bun:test";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  createOrganization,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

describe("admin_unlink_user", () => {
  test("removes the person's profile and keeps the login", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    await sql`SELECT public.admin_unlink_user(${memberId})`;

    await actAsSuperuser(sql);
    const [row] = await sql`
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = ${memberId}) AS has_profile,
             EXISTS (SELECT 1 FROM auth.users WHERE id = ${memberId}) AS has_login`;
    expect(row).toEqual({ has_profile: false, has_login: true });
  });

  test("fails with P0002 when the account is not linked", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(sql`SELECT public.admin_unlink_user(gen_random_uuid())`);

    expect(sqlState).toBe("P0002");
  });

  test("fails with P0014 when the account is a platform admin", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    const otherAdminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(sql`SELECT public.admin_unlink_user(${otherAdminId})`);

    expect(sqlState).toBe("P0014");
  });

  test("fails with 42501 when the caller is not a platform admin", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    const otherMemberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.admin_unlink_user(${otherMemberId})`);

    expect(sqlState).toBe("42501");
  });
});
