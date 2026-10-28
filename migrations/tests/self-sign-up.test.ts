import { describe, expect, test } from "bun:test";

import type { ReservedSQL } from "bun";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  createOrganization,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

async function createAccountWithoutProfile(sql: ReservedSQL): Promise<string> {
  const users: { id: string }[] = await sql`
    INSERT INTO auth.users (email) VALUES ('signup-' || gen_random_uuid() || '@example.com')
    RETURNING id`;
  const user = users[0];
  if (user == null) {
    throw new Error("INSERT into auth.users returned no row");
  }
  return user.id;
}

describe("register_my_organization", () => {
  test("creates the organization and makes the caller its owner", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const userId = await createAccountWithoutProfile(sql);
    await actAs(sql, "authenticated", userId);

    const [{ organization_id: organizationId }] = await sql`
      SELECT public.register_my_organization('  Ana Souza ', ' Padaria Nova ', '11222333000181')
        AS organization_id`;

    await actAsSuperuser(sql);
    const [profile] = await sql`
      SELECT p.name, p.role, o.name AS organization_name, o.document, o.status
      FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.user_id = ${userId} AND o.id = ${organizationId}`;
    expect(profile).toEqual({
      name: "Ana Souza",
      role: "owner",
      organization_name: "Padaria Nova",
      document: "11222333000181",
      status: "active",
    });
  });

  test("fails with P0014 when the account already has an organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.register_my_organization('Ana', 'Outra empresa', '11222333000181')`,
    );

    expect(sqlState).toBe("P0014");
  });

  test("fails with P0018 when the document is already registered", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await sql`
      INSERT INTO public.organizations (name, document) VALUES ('Existente', '11222333000181')`;
    const userId = await createAccountWithoutProfile(sql);
    await actAs(sql, "authenticated", userId);

    const sqlState = await captureSqlState(
      sql`SELECT public.register_my_organization('Ana', 'Padaria', '11222333000181')`,
    );

    expect(sqlState).toBe("P0018");
  });

  test("fails with 22023 when the document has the wrong number of digits", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const userId = await createAccountWithoutProfile(sql);
    await actAs(sql, "authenticated", userId);

    const sqlState = await captureSqlState(
      sql`SELECT public.register_my_organization('Ana', 'Padaria', '1234')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when the organization name is blank", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const userId = await createAccountWithoutProfile(sql);
    await actAs(sql, "authenticated", userId);

    const sqlState = await captureSqlState(
      sql`SELECT public.register_my_organization('Ana', '   ', '11222333000181')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with 22023 when the person name is blank", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const userId = await createAccountWithoutProfile(sql);
    await actAs(sql, "authenticated", userId);

    const sqlState = await captureSqlState(
      sql`SELECT public.register_my_organization(' ', 'Padaria', '11222333000181')`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with 42501 without a signed-in user", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    await actAs(sql, "authenticated");

    const sqlState = await captureSqlState(
      sql`SELECT public.register_my_organization('Ana', 'Padaria', '11222333000181')`,
    );

    expect(sqlState).toBe("42501");
  });
});
