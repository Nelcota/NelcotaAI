import { describe, expect, test } from "bun:test";

import type { ReservedSQL } from "bun";

import {
  actAs,
  actAsSuperuser,
  captureSqlState,
  createOrganization,
  createTopupRequest,
  createUser,
  openRollbackTransaction,
  readBalanceInCents,
} from "./database.fixtures";

async function uploadReceipt(sql: ReservedSQL, path: string): Promise<void> {
  await sql`
    INSERT INTO storage.objects (bucket_id, name, version, size, mime_type, etag)
    VALUES ('receipts', ${path}, gen_random_uuid(), 10, 'image/png', 'test')`;
}

describe("cancel_my_topup", () => {
  test("withdraws the customer's pending request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    await sql`SELECT public.cancel_my_topup(${requestId})`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT status, decided_by FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({ status: "withdrawn", decided_by: memberId });
  });

  test("fails with P0002 for another organization's request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    const otherRequestId = await createTopupRequest(sql, otherOrganizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.cancel_my_topup(${otherRequestId})`);

    expect(sqlState).toBe("P0002");
  });

  test("fails with P0014 when the request was already confirmed", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    await sql`SELECT public.admin_confirm_topup(${requestId})`;
    await actAsSuperuser(sql);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(sql`SELECT public.cancel_my_topup(${requestId})`);

    expect(sqlState).toBe("P0014");
  });

  test("a withdrawn request can no longer be confirmed", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);
    await sql`SELECT public.cancel_my_topup(${requestId})`;
    await actAsSuperuser(sql);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(sql`SELECT public.admin_confirm_topup(${requestId})`);

    expect(sqlState).toBe("P0014");
  });
});

describe("admin_confirm_topup with a payment reference", () => {
  test("stores the trimmed reference and credits the organization", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    await sql`SELECT public.admin_confirm_topup(${requestId}, '  MP-123456 ')`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT payment_reference FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({ payment_reference: "MP-123456" });
    expect(await readBalanceInCents(sql, organizationId)).toBe(5000);
  });

  test("stores no reference when it is blank", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    await sql`SELECT public.admin_confirm_topup(${requestId}, '   ')`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT payment_reference FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({ payment_reference: null });
  });

  test("fails with P0017 when the reference already confirmed another request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const firstRequestId = await createTopupRequest(sql, organizationId, 5000);
    const secondRequestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);
    await sql`SELECT public.admin_confirm_topup(${firstRequestId}, 'MP-1')`;

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_confirm_topup(${secondRequestId}, 'MP-1')`,
    );

    expect(sqlState).toBe("P0017");
  });

  test("fails with 22023 when the reference is longer than 120 characters", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const adminId = await createUser(sql, null, { isPlatformAdmin: true });
    await actAs(sql, "authenticated", adminId);

    const sqlState = await captureSqlState(
      sql`SELECT public.admin_confirm_topup(${requestId}, ${"x".repeat(121)})`,
    );

    expect(sqlState).toBe("22023");
  });
});

describe("attach_topup_receipt", () => {
  test("links an uploaded receipt to the pending request", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const path = `${organizationId}/${requestId}/comprovante.png`;
    await uploadReceipt(sql, path);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    await sql`SELECT public.attach_topup_receipt(${requestId}, ${path})`;

    await actAsSuperuser(sql);
    const [request] = await sql`
      SELECT receipt_path FROM public.topup_requests WHERE id = ${requestId}`;
    expect(request).toEqual({ receipt_path: path });
  });

  test("fails with 22023 when the path is outside the request folder", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.attach_topup_receipt(${requestId}, ${`other/${requestId}/a.png`})`,
    );

    expect(sqlState).toBe("22023");
  });

  test("fails with P0002 when the file was not uploaded", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const requestId = await createTopupRequest(sql, organizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      sql`SELECT public.attach_topup_receipt(${requestId}, ${`${organizationId}/${requestId}/a.png`})`,
    );

    expect(sqlState).toBe("P0002");
  });
});

describe("receipts storage policies", () => {
  test("a member cannot read another organization's receipts", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    const ownRequestId = await createTopupRequest(sql, organizationId, 5000);
    const otherRequestId = await createTopupRequest(sql, otherOrganizationId, 5000);
    await uploadReceipt(sql, `${organizationId}/${ownRequestId}/own.png`);
    await uploadReceipt(sql, `${otherOrganizationId}/${otherRequestId}/other.png`);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const rows = await sql`SELECT name FROM storage.objects WHERE bucket_id = 'receipts'`;

    expect(rows).toEqual([{ name: `${organizationId}/${ownRequestId}/own.png` }]);
  });

  test("a member cannot upload into another organization's folder", async () => {
    await using transaction = await openRollbackTransaction();
    const { sql } = transaction;
    const organizationId = await createOrganization(sql);
    const otherOrganizationId = await createOrganization(sql);
    const otherRequestId = await createTopupRequest(sql, otherOrganizationId, 5000);
    const memberId = await createUser(sql, organizationId);
    await actAs(sql, "authenticated", memberId);

    const sqlState = await captureSqlState(
      uploadReceipt(sql, `${otherOrganizationId}/${otherRequestId}/x.png`),
    );

    expect(sqlState).toBe("42501");
  });
});
