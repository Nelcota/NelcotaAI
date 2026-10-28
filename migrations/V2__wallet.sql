-- Wallet ledger, payments and Asaas webhook events.
--
-- The balance is always the sum of wallet_transactions; there is no editable balance column.
-- The ledger is insert-only: no role receives UPDATE, DELETE or TRUNCATE, and not even
-- service_role receives INSERT. Rows are written only by the SECURITY DEFINER functions in V4.

CREATE TYPE public.wallet_transaction_type AS ENUM ('topup', 'usage', 'refund', 'adjustment');
CREATE TYPE public.payment_method AS ENUM ('pix', 'card');

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
    type public.wallet_transaction_type NOT NULL,
    -- Positive adds credit, negative removes it.
    amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
    -- payments.id for topup, generations.id for usage and refund, null for adjustment.
    reference_id uuid,
    description text NOT NULL CHECK (btrim(description) <> '' AND length(description) <= 500),
    -- Audit only: no foreign key, so deleting a user never touches the immutable ledger.
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wallet_transactions_amount_sign CHECK (
        (type IN ('topup', 'refund') AND amount_cents > 0)
        OR (type = 'usage' AND amount_cents < 0)
        OR type = 'adjustment'
    ),
    CONSTRAINT wallet_transactions_reference_required CHECK (
        type = 'adjustment' OR reference_id IS NOT NULL
    )
);
-- Makes credit_topup, reserve_generation and refund_generation idempotent at the database
-- level: each payment or generation can produce at most one row of each type.
CREATE UNIQUE INDEX wallet_transactions_reference_once_idx
    ON public.wallet_transactions (type, reference_id)
    WHERE type IN ('topup', 'usage', 'refund');
CREATE INDEX wallet_transactions_organization_created_idx
    ON public.wallet_transactions (organization_id, created_at DESC);

CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
    asaas_payment_id text NOT NULL UNIQUE CHECK (btrim(asaas_payment_id) <> ''),
    method public.payment_method NOT NULL,
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),
    -- Asaas status verbatim (PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED...).
    status text NOT NULL CHECK (status ~ '^[A-Z_]{1,50}$'),
    invoice_url text,
    pix_qr_image text,
    pix_copy_paste text,
    raw_last_event jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_organization_created_idx ON public.payments (organization_id, created_at DESC);
CREATE INDEX payments_pending_idx ON public.payments (created_at) WHERE status = 'PENDING';

CREATE TABLE public.asaas_webhook_events (
    event_id text PRIMARY KEY CHECK (btrim(event_id) <> ''),
    type text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.wallet_transactions TO authenticated, service_role;
CREATE POLICY wallet_transactions_select ON public.wallet_transactions FOR SELECT TO authenticated
    USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- raw_last_event stays internal: customers only see the columns the UI needs.
GRANT SELECT (id, organization_id, method, amount_cents, status, invoice_url, pix_qr_image,
              pix_copy_paste, created_at, updated_at)
    ON public.payments TO authenticated;
GRANT SELECT,
      INSERT (organization_id, asaas_payment_id, method, amount_cents, status, invoice_url,
              pix_qr_image, pix_copy_paste, raw_last_event),
      UPDATE (status, invoice_url, pix_qr_image, pix_copy_paste, raw_last_event, updated_at)
    ON public.payments TO service_role;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
    USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Webhook events: server only. RLS on with no policy blocks every API role but service_role.
GRANT SELECT, INSERT (event_id, type, payload), UPDATE (processed_at)
    ON public.asaas_webhook_events TO service_role;

-- security_invoker = true: without it the view would run with its owner's privileges and
-- ignore the caller's RLS, exposing every organization's balance.
CREATE VIEW public.organization_balances WITH (security_invoker = true) AS
SELECT
    o.id AS organization_id,
    coalesce(sum(t.amount_cents), 0)::bigint AS balance_cents,
    coalesce(
        -sum(t.amount_cents) FILTER (
            WHERE t.type IN ('usage', 'refund') AND t.created_at >= internal.current_month_start()
        ),
        0
    )::bigint AS month_spend_cents
FROM public.organizations o
LEFT JOIN public.wallet_transactions t ON t.organization_id = o.id
GROUP BY o.id;

GRANT SELECT ON public.organization_balances TO authenticated, service_role;
