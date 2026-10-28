-- Core schema: organizations, people, settings, the prepaid ledger and top-up requests.
--
-- Authorization lives only in GRANTs and RLS. New tables in Nelcota have no default
-- privileges, so every GRANT below is explicit and minimal. service_role bypasses RLS,
-- therefore its GRANTs are the only thing limiting what the app server can read or write.
-- Every write to the ledger and to top-up requests goes through the SECURITY DEFINER functions
-- in V2 and V3; no API role can insert, update or delete those rows directly.

-- Internal helpers live outside the exposed schema (NELCOTA_DB_SCHEMA=public), so they never
-- become RPC endpoints.
CREATE SCHEMA internal;
GRANT USAGE ON SCHEMA internal TO authenticated, service_role;

-- Start of the current billing month. Months follow the customers' wall clock (Sao Paulo),
-- while every timestamp is stored in UTC.
CREATE FUNCTION internal.current_month_start() RETURNS timestamptz
    LANGUAGE sql STABLE SET search_path = ''
AS $$
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
$$;
REVOKE EXECUTE ON FUNCTION internal.current_month_start() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.current_month_start() TO authenticated, service_role;

-- Check digits of a CPF (11 digits) or CNPJ (14 digits). Enforced by a trigger so every write
-- path, including direct administrator API calls, stores only valid documents.
CREATE FUNCTION internal.is_valid_tax_document(p_document text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
    v_length integer := length(p_document);
    v_position integer;
    v_check integer;
    v_sum integer;
    v_weight integer;
    v_expected integer;
BEGIN
    IF p_document IS NULL OR p_document !~ '^([0-9]{11}|[0-9]{14})$'
       OR p_document = repeat(substr(p_document, 1, 1), v_length) THEN
        RETURN false;
    END IF;
    FOR v_check IN (v_length - 1)..v_length LOOP
        v_sum := 0;
        FOR v_position IN 1..(v_check - 1) LOOP
            IF v_length = 11 THEN
                v_weight := v_check + 1 - v_position;
            ELSE
                v_weight := 2 + ((v_check - 1 - v_position) % 8);
            END IF;
            v_sum := v_sum + substr(p_document, v_position, 1)::integer * v_weight;
        END LOOP;
        v_expected := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - v_sum % 11 END;
        IF substr(p_document, v_check, 1)::integer <> v_expected THEN
            RETURN false;
        END IF;
    END LOOP;
    RETURN true;
END
$$;

CREATE FUNCTION internal.validate_organization_document() RETURNS trigger
    LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    IF internal.is_valid_tax_document(NEW.document) = false THEN
        RAISE EXCEPTION 'organization document has invalid check digits' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END
$$;

-- Types -------------------------------------------------------------------------------------
CREATE TYPE public.organization_status AS ENUM ('active', 'blocked');
CREATE TYPE public.member_role AS ENUM ('owner', 'member');
-- topup: credit from a paid top-up request. adjustment: manual correction by the platform admin.
CREATE TYPE public.wallet_transaction_type AS ENUM ('topup', 'adjustment');
-- withdrawn: the customer gave up. cancelled: the admin refused it or the payment failed.
CREATE TYPE public.topup_request_status AS ENUM ('pending', 'confirmed', 'cancelled', 'withdrawn');
-- manual_pix: paid to the company's Pix key and confirmed by the admin by hand.
-- pix and card: paid through Mercado Pago and credited automatically.
CREATE TYPE public.topup_payment_method AS ENUM ('manual_pix', 'pix', 'card');

-- Organizations and people ------------------------------------------------------------------
CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
    -- CPF (11 digits) or CNPJ (14 digits), digits only. The trigger below checks the digits.
    document text NOT NULL UNIQUE CHECK (document ~ '^([0-9]{11}|[0-9]{14})$'),
    status public.organization_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Existing rows can still be read or blocked; inserts and document changes must be valid.
CREATE TRIGGER organizations_validate_document BEFORE INSERT OR UPDATE OF document
    ON public.organizations FOR EACH ROW EXECUTE FUNCTION internal.validate_organization_document();

CREATE TABLE public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations (id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
    role public.member_role NOT NULL DEFAULT 'member',
    is_platform_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Only the platform admin may exist without an organization.
    CONSTRAINT profiles_organization_required CHECK (organization_id IS NOT NULL OR is_platform_admin)
);
CREATE INDEX profiles_organization_id_idx ON public.profiles (organization_id);

-- Settings ----------------------------------------------------------------------------------
-- Single-row table: the boolean primary key can only ever be true.
CREATE TABLE public.settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- Pix receiving data for manual top-ups. Null until the admin fills it in; manual requests
    -- are refused while any of the three is missing. The city is BR Code field 60 (15 chars).
    pix_key text CHECK (btrim(pix_key) <> '' AND length(pix_key) <= 140),
    pix_receiver_name text CHECK (btrim(pix_receiver_name) <> '' AND length(pix_receiver_name) <= 200),
    pix_city text CHECK (btrim(pix_city) <> '' AND length(pix_city) <= 15),
    minimum_topup_cents bigint NOT NULL CHECK (minimum_topup_cents > 0),
    maximum_topup_cents bigint NOT NULL,
    CONSTRAINT settings_topup_range CHECK (maximum_topup_cents >= minimum_topup_cents)
);
INSERT INTO public.settings (minimum_topup_cents, maximum_topup_cents) VALUES (2000, 500000);

-- Ledger ------------------------------------------------------------------------------------
-- The balance is always the sum of wallet_transactions; there is no editable balance column.
-- The ledger is insert-only: no API role receives INSERT, UPDATE, DELETE or TRUNCATE.
CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
    type public.wallet_transaction_type NOT NULL,
    -- Positive adds credit, negative removes it.
    amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
    -- topup_requests.id for topup, null for adjustment.
    reference_id uuid,
    description text NOT NULL CHECK (btrim(description) <> '' AND length(description) <= 500),
    -- Audit only: no foreign key, so deleting a user never touches the immutable ledger.
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wallet_transactions_amount_sign CHECK (
        (type = 'topup' AND amount_cents > 0) OR type = 'adjustment'
    ),
    CONSTRAINT wallet_transactions_reference_required CHECK (
        type = 'adjustment' OR reference_id IS NOT NULL
    )
);
-- A request is credited at most once, whichever path (admin or provider) credits it.
CREATE UNIQUE INDEX wallet_transactions_reference_once_idx
    ON public.wallet_transactions (type, reference_id)
    WHERE type = 'topup';
-- Ledger pages use a (created_at, id) cursor, so rows that share a timestamp are never skipped.
CREATE INDEX wallet_transactions_cursor_idx
    ON public.wallet_transactions (organization_id, created_at DESC, id DESC);
CREATE INDEX wallet_transactions_credit_idx
    ON public.wallet_transactions (organization_id, created_at DESC, id DESC)
    WHERE type = 'topup';

-- Top-up requests ---------------------------------------------------------------------------
CREATE TABLE public.topup_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),
    status public.topup_request_status NOT NULL DEFAULT 'pending',
    payment_method public.topup_payment_method NOT NULL DEFAULT 'manual_pix',
    -- Audit only: no foreign keys, so deleting a user keeps the history.
    requested_by uuid NOT NULL,
    decided_by uuid,
    decided_at timestamptz,
    cancel_reason text CHECK (btrim(cancel_reason) <> '' AND length(cancel_reason) <= 500),
    -- Manual Pix: the transaction id the admin typed when confirming (one payment, one request)
    -- and the receipt the customer uploaded to the receipts bucket.
    payment_reference text
        CHECK (btrim(payment_reference) <> '' AND length(payment_reference) <= 120),
    receipt_path text CHECK (length(receipt_path) <= 300),
    -- Mercado Pago: the payment id and the last status read from the provider (never taken from
    -- the webhook body). provider_updated_at is the provider's own version of that status, so
    -- a stale poll can never overwrite a newer webhook.
    provider_payment_id text UNIQUE
        CHECK (btrim(provider_payment_id) <> '' AND length(provider_payment_id) <= 40),
    provider_status text CHECK (btrim(provider_status) <> '' AND length(provider_status) <= 40),
    provider_updated_at timestamptz,
    -- Set once the payment body was stored for the gateway call. From then on an unknown
    -- outcome must be recovered, never retried as a new charge.
    payment_prepared_at timestamptz,
    -- Pix "copia e cola" code and its deadline, so the customer can reopen the QR Code.
    pix_qr_code text CHECK (btrim(pix_qr_code) <> '' AND length(pix_qr_code) <= 1000),
    pix_expires_at timestamptz,
    -- The request that already holds this payment's credit, when the provider reports the same
    -- payment for two requests. The duplicate is closed instead of credited twice.
    duplicate_of_request_id uuid REFERENCES public.topup_requests (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT topup_requests_decision CHECK ((status = 'pending') = (decided_at IS NULL)),
    CONSTRAINT topup_requests_cancel_reason CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL),
    CONSTRAINT topup_requests_duplicate_closed CHECK (
        duplicate_of_request_id IS NULL OR (
            duplicate_of_request_id <> id AND status = 'cancelled' AND payment_method <> 'manual_pix'
        )
    )
);
-- Every listing pages with a (created_at, id) cursor: the customer history (by organization),
-- the admin history (all requests, optionally by status) and the pending queue (by status).
CREATE INDEX topup_requests_organization_cursor_idx
    ON public.topup_requests (organization_id, created_at DESC, id DESC);
CREATE INDEX topup_requests_cursor_idx ON public.topup_requests (created_at DESC, id DESC);
CREATE INDEX topup_requests_status_cursor_idx
    ON public.topup_requests (status, created_at DESC, id DESC);
-- One manual payment can only confirm one request.
CREATE UNIQUE INDEX topup_requests_payment_reference_idx
    ON public.topup_requests (payment_reference)
    WHERE payment_reference IS NOT NULL;
CREATE INDEX topup_requests_duplicate_idx ON public.topup_requests (duplicate_of_request_id)
    WHERE duplicate_of_request_id IS NOT NULL;

-- Payment body (tokenized card or Pix order) stored before the gateway call, so a lost
-- response is retried with exactly the same idempotent operation. The body holds the card
-- token, so customers and admins cannot read it; only the SECURITY DEFINER functions in V3
-- write it.
CREATE TABLE public.online_payment_attempts (
    request_id uuid PRIMARY KEY REFERENCES public.topup_requests (id) ON DELETE CASCADE,
    payload jsonb NOT NULL
        CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
    -- Held by the worker that is calling the gateway; expired leases can be claimed again.
    lease_until timestamptz
);

-- Helpers used by the policies ---------------------------------------------------------------
-- SECURITY DEFINER so RLS policies on profiles can call these without recursing into
-- the profiles policies themselves.
CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT coalesce(
        (SELECT p.is_platform_admin FROM public.profiles p WHERE p.user_id = auth.uid()),
        false
    )
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

CREATE FUNCTION public.current_organization_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;

-- Grants and row level security ---------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_payment_attempts ENABLE ROW LEVEL SECURITY;

-- organizations: members read their own; the platform admin reads and manages all. The app
-- server reads them to build the payer of an online payment.
GRANT SELECT ON public.organizations TO authenticated, service_role;
GRANT INSERT (name, document) ON public.organizations TO authenticated;
GRANT UPDATE (name, document, status) ON public.organizations TO authenticated;

CREATE POLICY organizations_select ON public.organizations FOR SELECT TO authenticated
    USING (id = public.current_organization_id() OR public.is_platform_admin());
CREATE POLICY organizations_admin_insert ON public.organizations FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin());
CREATE POLICY organizations_admin_update ON public.organizations FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- profiles: read-only through the API. Nobody can promote themselves to admin; profiles are
-- created by self sign-up, by the admin linking flow or by SQL.
GRANT SELECT ON public.profiles TO authenticated, service_role;

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR organization_id = public.current_organization_id()
        OR public.is_platform_admin()
    );

-- settings: every signed-in user reads them (the checkout shows the limits); only the platform
-- admin edits.
GRANT SELECT ON public.settings TO authenticated;
GRANT UPDATE (pix_key, pix_receiver_name, pix_city, minimum_topup_cents, maximum_topup_cents)
    ON public.settings TO authenticated;

CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin_update ON public.settings FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- ledger and requests: read-only through the API, scoped to the caller's organization. The app
-- server reads requests before creating or reconciling a Mercado Pago payment.
GRANT SELECT ON public.wallet_transactions TO authenticated, service_role;
CREATE POLICY wallet_transactions_select ON public.wallet_transactions FOR SELECT TO authenticated
    USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

GRANT SELECT ON public.topup_requests TO authenticated, service_role;
CREATE POLICY topup_requests_select ON public.topup_requests FOR SELECT TO authenticated
    USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- online_payment_attempts: the app server may inspect attempts, never write them. RLS on with
-- no policy blocks every other API role, so the card token never reaches a customer or admin.
GRANT SELECT ON public.online_payment_attempts TO service_role;

-- Views ---------------------------------------------------------------------------------------
-- security_invoker = true: without it the views would run with their owner's privileges and
-- ignore the caller's RLS, exposing every organization's balance.
CREATE VIEW public.organization_balances WITH (security_invoker = true) AS
SELECT
    o.id AS organization_id,
    coalesce(sum(t.amount_cents), 0)::bigint AS balance_cents,
    coalesce(
        sum(t.amount_cents) FILTER (
            WHERE t.type = 'topup' AND t.created_at >= internal.current_month_start()
        ),
        0
    )::bigint AS month_topup_cents
FROM public.organizations o
LEFT JOIN public.wallet_transactions t ON t.organization_id = o.id
GROUP BY o.id;
GRANT SELECT ON public.organization_balances TO authenticated, service_role;

CREATE VIEW public.organization_summaries WITH (security_invoker = true) AS
SELECT o.id, o.name, o.document, o.status, o.created_at, b.balance_cents, b.month_topup_cents
FROM public.organizations o
JOIN public.organization_balances b ON b.organization_id = o.id;
GRANT SELECT ON public.organization_summaries TO authenticated;

-- Receipts of manual Pix payments -------------------------------------------------------------
-- Private bucket, 5 MiB, images or PDF. Paths: {organization_id}/{request_id}/{file}.
INSERT INTO storage.buckets (id, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', false, 5242880, '{image/png,image/jpeg,image/webp,application/pdf}');

-- Customers upload only into their organization's folder, for their own pending request.
CREATE POLICY receipts_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = public.current_organization_id()::text
        AND EXISTS (
            SELECT 1 FROM public.topup_requests r
             WHERE r.id::text = (storage.foldername(name))[2]
               AND r.organization_id = public.current_organization_id()
               AND r.status = 'pending'
        )
    );
CREATE POLICY receipts_select ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'receipts'
        AND (
            (storage.foldername(name))[1] = public.current_organization_id()::text
            OR public.is_platform_admin()
        )
    );
