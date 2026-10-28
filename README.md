<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/brand/nelcota-logo-dark.svg">
    <img src=".github/brand/nelcota-logo-light.svg" alt="Nelcota" width="280">
  </picture>
</p>

<h3 align="center">Nelcota AI</h3>

<p align="center">
  Prepaid OpenAI credit for businesses. Customers top up with Pix or card and the ledger is credited automatically.
</p>

<p align="center">
  <a href="https://bun.sh">Bun</a> ·
  <a href="https://tanstack.com/start">TanStack Start</a> ·
  <a href="https://react.dev">React 19</a> ·
  <a href="https://tailwindcss.com">Tailwind 4</a> ·
  <a href="https://github.com/Nelcota/Nelcota">Nelcota</a> (Postgres, auth, RLS) ·
  <a href="https://www.mercadopago.com.br/developers">Mercado Pago</a>
</p>

---

## What it does

- **Customers** create an account and company, request a top-up and pay with Pix (QR code) or a tokenized card. Approved payments credit the balance without manual steps, and the history can be exported as CSV.
- **Administrators** review manual Pix requests, confirm or reject them, adjust balances and manage organizations.
- **Payments** are idempotent and recoverable: every attempt has a stable ID, lost provider responses are reconciled, duplicates are resolved without a second credit, and refunds or chargebacks are flagged for review instead of being debited automatically.

## Getting started

Requirements: [Bun](https://bun.sh), Docker and the `nelcota` CLI 0.5.5 (the version CI runs; see `.github/workflows/check.yml`).

```sh
bun install
nelcota dev            # Postgres + Nelcota API at http://127.0.0.1:8000 (keep it running)
cp .env.example .env   # fill in the values; DATABASE_URL comes from .nelcota/dev.env
bun run db:migrate     # applies migrations/V*.sql
bun run db:types       # regenerates src/shared/database.ts (never edit it by hand)
bun run dev            # http://localhost:3000
```

The Nelcota panel lives at http://127.0.0.1:8000/admin/ (credentials in `.nelcota/dev.env`). Create the first login there, then promote it:

```sql
INSERT INTO public.profiles (user_id, name, is_platform_admin)
SELECT id, 'Admin', true FROM auth.users WHERE email = 'admin@example.com';
```

Mercado Pago credentials and the webhook secret are listed in `.env.example`. A public HTTPS `APP_URL` enables the webhook at `/api/mercado-pago/webhook`; without it, payments are still reconciled by polling.

## Scripts

| Command            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `bun run dev`      | Development server with hot reload                                  |
| `bun run build`    | Production build in `dist/`                                         |
| `bun run check`    | Formatting, Oxlint, types, Knip and unit tests (no database needed) |
| `bun run test:db`  | SQL functions and RLS against the running `nelcota dev` database    |
| `bun run format`   | Formats everything with Oxfmt                                       |
| `bun run db:types` | Regenerates the database types after a migration                    |

Git hooks (Lefthook) run the same checks before every commit. CI runs them on every push and pull request, plus the production build, a dependency audit and the database tests against a fresh `nelcota dev` environment.

## Project layout

```
src/
  auth/        sign in, sign up, magic link, password recovery, session cache
  topups/      customer pages, with checkout/, overview/, history/ and reconciliation/
  payments/    Mercado Pago server functions, webhook, reconciliation
  admin/       pending requests, customers, history, settings
  layout/      app shell, theme, toaster
  components/  shared UI (shadcn/ui under components/ui)
  shared/      formatting, money, dates, env, generated database types
  routes/      TanStack Start file routes (pt-BR URLs)
migrations/    SQL migrations V1..V3 and their database tests
```

Each feature folder is a package with a public `index.ts`; other packages import only through it. Money is handled in cents, dates in UTC, and every visible string is in Brazilian Portuguese.
