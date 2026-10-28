import { expect, test } from "bun:test";

import { isCNPJ, isCPF } from "validation-br";
import { CNPJ } from "validation-br/cnpj";

import {
  actAs,
  captureSqlState,
  createOrganization,
  createUser,
  openRollbackTransaction,
} from "./database.fixtures";

test.each([
  "52998224725",
  "11222333000181",
  "00000000000",
  "12345678901",
  "11222333000180",
  "123",
  "",
])("database check digits agree with the shared library for %s", async (document) => {
  await using transaction = await openRollbackTransaction();
  const [row] = await transaction.sql`SELECT internal.is_valid_tax_document(${document}) AS valid`;

  expect(row?.valid).toBe(document.length === 11 ? isCPF(document) : isCNPJ(document));
});

test("checks random numeric CNPJs against the library", async () => {
  await using transaction = await openRollbackTransaction();
  const documents = Array.from({ length: 20 }, () => {
    const prefix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`)
      .toString()
      .slice(0, 12);
    return prefix + CNPJ.checksum(prefix);
  });

  // Sent as one comma-separated string: bun:sql up to 1.4.3 turns an array parameter into
  // "a,b,c", which Postgres rejects as an array literal.
  // TODO: pass `${documents}::text[]` to unnest once packageManager is Bun 1.4.4 or newer.
  const rows: { valid: boolean }[] =
    await transaction.sql`SELECT internal.is_valid_tax_document(document) AS valid
    FROM unnest(string_to_array(${documents.join(",")}, ',')) AS document`;

  expect(rows).toHaveLength(20);
  expect(rows.every((row) => row.valid === true)).toBe(true);
});

test("direct administrator inserts reject invalid check digits", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const adminId = await createUser(sql, null, { isPlatformAdmin: true });
  await actAs(sql, "authenticated", adminId);

  const state = await captureSqlState(
    sql`INSERT INTO public.organizations(name, document) VALUES ('Test invalid document', '00000000000')`,
  );

  expect(state).toBe("22023");
});

test("document updates reject invalid check digits", async () => {
  await using transaction = await openRollbackTransaction();
  const { sql } = transaction;
  const organizationId = await createOrganization(sql);

  const state = await captureSqlState(
    sql`UPDATE public.organizations SET document = '12345678901' WHERE id = ${organizationId}`,
  );

  expect(state).toBe("22023");
});
