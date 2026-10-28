import { SQL, type ReservedSQL, type TransactionSQL } from "bun";
import { CNPJ } from "validation-br/cnpj";

/** Roles the Nelcota API assumes for each request. */
type ApiRole = "authenticated" | "service_role";
type TestSQL = ReservedSQL | TransactionSQL;

function readDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl == null || databaseUrl.trim() === "") {
    throw new Error(
      "DATABASE_URL is not set: start `nelcota dev` and point DATABASE_URL at its Postgres (see .env.example)",
    );
  }
  return databaseUrl;
}

const database = new SQL(readDatabaseUrl());
const CNPJ_PREFIX_LENGTH = 12;

/**
 * A database transaction that is always rolled back when disposed, so each test starts from the
 * migrated schema and leaves nothing behind.
 */
interface RollbackTransaction extends AsyncDisposable {
  readonly sql: ReservedSQL;
}

/**
 * Opens a transaction on a dedicated connection as the `postgres` superuser.
 *
 * @returns The transaction; use it with `await using` so it rolls back at the end of the test.
 *
 * @example
 * await using transaction = await openRollbackTransaction();
 * await transaction.sql`SELECT 1`;
 */
export async function openRollbackTransaction(): Promise<RollbackTransaction> {
  const reserved = await database.reserve();
  await reserved`BEGIN`;
  return {
    sql: reserved,
    async [Symbol.asyncDispose]() {
      await reserved`ROLLBACK`;
      reserved.release();
    },
  };
}

/**
 * Switches the transaction to an API role with JWT claims, exactly as Nelcota does for each
 * request (`SET LOCAL ROLE` plus `request.jwt.claims`).
 *
 * @param sql - Connection inside a rollback transaction.
 * @param role - Role to assume.
 * @param userId - The `sub` claim; required for `authenticated`.
 */
export async function actAs(sql: TestSQL, role: ApiRole, userId?: string): Promise<void> {
  const claims = userId == null ? { role } : { role, sub: userId };
  await sql`SELECT set_config('role', ${role}, true), set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
}

/**
 * Returns the transaction to the `postgres` superuser after {@link actAs}.
 *
 * @param sql - Connection inside a rollback transaction.
 */
export async function actAsSuperuser(sql: TestSQL): Promise<void> {
  await sql`RESET ROLE`;
  await sql`SELECT set_config('request.jwt.claims', '', true)`;
}

/**
 * Creates an organization with a random CNPJ.
 *
 * @param sql - Connection inside a rollback transaction, as superuser.
 * @param options - Optional status.
 * @returns The organization id.
 */
export async function createOrganization(
  sql: TestSQL,
  options: { status?: "active" | "blocked" } = {},
): Promise<string> {
  const prefix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`)
    .toString()
    .slice(0, CNPJ_PREFIX_LENGTH);
  const document = prefix + CNPJ.checksum(prefix);
  const rows: { id: string }[] = await sql`
    INSERT INTO public.organizations (name, document, status)
    VALUES (
      'Test organization',
      ${document},
      ${options.status ?? "active"}
    )
    RETURNING id`;
  return firstId(rows);
}

/**
 * Creates an auth user and its profile.
 *
 * @param sql - Connection inside a rollback transaction, as superuser.
 * @param organizationId - Organization of the user, or null for a platform admin.
 * @param options - Whether the user is a platform admin.
 * @returns The user id.
 */
export async function createUser(
  sql: TestSQL,
  organizationId: string | null,
  options: { isPlatformAdmin?: boolean } = {},
): Promise<string> {
  const users: { id: string }[] = await sql`
    INSERT INTO auth.users (email) VALUES ('test-' || gen_random_uuid() || '@example.com')
    RETURNING id`;
  const userId = firstId(users);
  await sql`
    INSERT INTO public.profiles (user_id, organization_id, name, is_platform_admin)
    VALUES (${userId}, ${organizationId}, 'Test user', ${options.isPlatformAdmin ?? false})`;
  return userId;
}

/**
 * Fills in the Pix receiving data so customers can request top-ups.
 *
 * @param sql - Connection inside a rollback transaction, as superuser.
 */
export async function configurePix(sql: TestSQL): Promise<void> {
  await sql`
    UPDATE public.settings
    SET pix_key = 'financeiro@example.com', pix_receiver_name = 'Nelcota AI Ltda', pix_city = 'SAO PAULO',
        minimum_topup_cents = 2000, maximum_topup_cents = 500000`;
}

/**
 * Creates a pending top-up request directly (bypassing the functions under test).
 *
 * @param sql - Connection inside a rollback transaction, as superuser.
 * @param organizationId - Organization that asked for the top-up.
 * @param amountInCents - Requested amount in cents.
 * @returns The request id.
 */
export async function createTopupRequest(
  sql: TestSQL,
  organizationId: string,
  amountInCents: number,
): Promise<string> {
  const rows: { id: string }[] = await sql`
    INSERT INTO public.topup_requests (organization_id, amount_cents, requested_by)
    VALUES (${organizationId}, ${amountInCents}, gen_random_uuid())
    RETURNING id`;
  return firstId(rows);
}

/**
 * Adds credit straight into the ledger (bypassing the functions under test).
 *
 * @param sql - Connection inside a rollback transaction, as superuser.
 * @param organizationId - Organization to credit.
 * @param amountInCents - Amount in cents; positive adds credit.
 */
export async function addCredit(
  sql: TestSQL,
  organizationId: string,
  amountInCents: number,
): Promise<void> {
  await sql`
    INSERT INTO public.wallet_transactions (organization_id, type, amount_cents, description)
    VALUES (${organizationId}, 'adjustment', ${amountInCents}, 'Test credit')`;
}

/**
 * Reads the organization balance through the organization_balances view.
 *
 * @param sql - Connection inside a rollback transaction, as superuser.
 * @param organizationId - Organization to read.
 * @returns The balance in cents.
 */
export async function readBalanceInCents(sql: TestSQL, organizationId: string): Promise<number> {
  const rows: { balance_cents: string }[] = await sql`
    SELECT balance_cents::text FROM public.organization_balances
    WHERE organization_id = ${organizationId}`;
  const row = rows[0];
  if (row == null) {
    throw new Error(`organization ${organizationId} has no balance row`);
  }
  return Number(row.balance_cents);
}

/**
 * Runs a query that must fail and returns the Postgres SQLSTATE it failed with.
 *
 * @param query - The failing query.
 * @returns The SQLSTATE (for example `P0012`).
 * @throws {Error} When the query succeeds or fails with something other than a Postgres error.
 */
export async function captureSqlState(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    if (error instanceof SQL.PostgresError && error.errno != null) {
      return error.errno;
    }
    throw error;
  }
  throw new Error("expected the query to fail, but it succeeded");
}

function firstId(rows: { id: string }[]): string {
  const row = rows[0];
  if (row == null) {
    throw new Error("INSERT ... RETURNING id returned no rows");
  }
  return row.id;
}
