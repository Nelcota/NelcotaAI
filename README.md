# Nelcota AI

Prepaid OpenAI credit dashboard for businesses, built with Bun, TanStack Start and
[Nelcota](https://github.com/Nelcota/Nelcota) 0.5.5 (Postgres, auth and RLS).
Customers pay top-ups with Pix or tokenized cards through Mercado Pago. Approved payments
credit the application ledger automatically. Legacy manual Pix requests remain available for
administrator review.

## Run locally

Requirements: Bun, Docker and the `nelcota` CLI 0.5.5.

```sh
bun install
nelcota dev                 # Postgres + Nelcota API at http://127.0.0.1:8000 (keep it running)
cp .env.example .env        # fill DATABASE_URL from .nelcota/dev.env
bun run db:migrate          # apply migrations/V*.sql
bun run db:types            # regenerate src/shared/database.ts (never edit it by hand)
bun run dev                 # app at http://localhost:3000
```

The Nelcota panel is at http://127.0.0.1:8000/admin/ (credentials in `.nelcota/dev.env`).

## Accounts and payment configuration

Create the first administrator account in the Nelcota panel, then assign its platform profile
in the panel's SQL editor:

```sql
INSERT INTO public.profiles (user_id, name, is_platform_admin)
SELECT id, 'Admin', true FROM auth.users WHERE email = 'admin@example.com';
```

Customers can register through the application when signup is enabled in the Nelcota project.
Administrators can also create organizations and link existing accounts from the customer page.
Every organization write validates the CPF/CNPJ check digits.

Configure the server credentials and public card key listed in `.env.example`. A public HTTPS
`APP_URL` enables the Mercado Pago webhook at `/api/mercado-pago/webhook`. While the customer is
signed in, pending-list polling reads only the database. A separate command scheduler
reconciles Pix and card payments, including responses lost before the provider payment ID was
saved. Payment transport failures never discard the pending snapshot, and both cycles retry
without requiring a window-focus event. Refunds and chargebacks remain visible for
administrator review; they do not automatically debit the ledger.

## Payment recovery and financial queries

A browser-generated attempt ID becomes the request ID and gateway idempotency key. Before the
first gateway call, the server stores the exact allowlisted payload in a service-role-only
table. Unknown outcomes are searched by external reference before the original operation is
retried. A short database lease prevents competing workers from submitting the same attempt.
Retained payloads, including tokenized card tokens, are deleted when a provider observation is
recorded or creation is definitively refused. Raw card numbers and security codes never enter
this application.

An unresolved creation must be reconciled before it can be cancelled or replaced with a
different payment. Legacy attempts created before V11 can be searched by reference, but cannot
be replayed if their original payload was never retained; review those with the provider if no
payment can be located.

Webhook HTTP handling, payment orchestration, gateway communication and database persistence
have separate modules in `src/payments`. Financial indicators use complete database read models
rather than deriving totals from paginated request lists. History and CSV exports share a
compound timestamp/ID cursor, and organization lookups load every joined balance page.

Session changes remount account-owned route content as well as clearing its query cache. This
drops mounted query results and local checkout state together. Pix mutation callbacks are
captured with their original submission, so later renders cannot reassign a late outcome.
Administrator queues, summary metrics and monthly trends refresh on the same cadence.
Customer balances, credit totals and history also poll every 30 seconds, independently of
pending membership, so payments completed between pending snapshots still appear automatically.

Manual confirmations and automatic approvals serialize their checks of both payment reference
columns. Manual confirmations reject reused references with `P0017`. When a provider payment
is already linked to another request, reconciliation preserves its provider identity, records
`duplicate_of_request_id`, closes the losing request and deletes its retained payload. It adds
no second credit, and later observations cannot reopen the duplicate. Conflicts across organizations
retain the original credit for administrator review rather than transferring it automatically.
Pix creation handles confirmed and closed attempts before requiring a QR code, so a declined
payment cannot appear as processing and an already approved payment is not offered for payment again.

Provider ordering uses only provider timestamps. An observation without a timestamp preserves
an existing provider version instead of recording the application clock. V15 clears legacy
ordering metadata whose clock provenance is unknown; decisions and ledger entries are preserved.
V16 closes pending requests whose first recorded observation was a refund or chargeback, including
existing uncredited reversals. Previously confirmed credits retain their ledger entries and
provider warnings for administrator review.
V17 resolves duplicate attempts atomically. Attempts blocked by the previous duplicate error
recover on their next successful reconciliation; new top-ups can then use the same or a different
amount. Apply this migration before starting the updated application and regenerate schema types.

Apply all migrations before starting an updated application instance, then regenerate the
schema types with `bun run db:types`.

## Checks

```sh
bun run check     # format, Oxlint, types, Knip and unit tests (no database needed)
bun run test:db   # SQL functions and RLS, against the running `nelcota dev` database
```

Database tests run each scenario in a transaction that is always rolled back.
