-- MVP scope: customers request a top-up and pay by Pix to the company's account; the admin
-- checks the payment, adds the credit at OpenAI by hand and then confirms the request here.
-- Image generation, pricing, storage and Asaas are out of scope for now and are removed.
--
-- New error codes (see V4 for the others):
--   P0015  too many pending top-up requests for the organization
--   P0016  Pix receiving data is not configured yet

-- Image generation (V3, V4, V5) ------------------------------------------------------------
DROP FUNCTION public.reserve_generation(uuid, uuid, uuid, text);
DROP FUNCTION public.refund_generation(uuid);
DROP FUNCTION public.get_dashboard_metrics(date, date);
DROP FUNCTION public.admin_overview(date);
DROP POLICY generations_bucket_select ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'generations';
DROP TABLE public.generations;
DROP TABLE public.pricing;
DROP TYPE public.generation_status;
DROP TYPE public.image_quality;

-- Asaas (V2, V4) ---------------------------------------------------------------------------
DROP FUNCTION public.credit_topup(text);
DROP TABLE public.asaas_webhook_events;
DROP TABLE public.payments;
DROP TYPE public.payment_method;
ALTER TABLE public.organizations
    DROP COLUMN asaas_customer_id,
    DROP COLUMN monthly_spend_limit_cents;

-- Settings: what the customer needs to pay by Pix --------------------------------------------
DROP TABLE public.settings;
CREATE TABLE public.settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- Null until the admin fills it in; requests are refused while it is missing.
    pix_key text CHECK (btrim(pix_key) <> '' AND length(pix_key) <= 140),
    pix_receiver_name text CHECK (btrim(pix_receiver_name) <> '' AND length(pix_receiver_name) <= 200),
    minimum_topup_cents bigint NOT NULL CHECK (minimum_topup_cents > 0),
    maximum_topup_cents bigint NOT NULL,
    CONSTRAINT settings_topup_range CHECK (maximum_topup_cents >= minimum_topup_cents)
);
INSERT INTO public.settings (minimum_topup_cents, maximum_topup_cents) VALUES (2000, 500000);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.settings TO authenticated;
GRANT UPDATE (pix_key, pix_receiver_name, minimum_topup_cents, maximum_topup_cents)
    ON public.settings TO authenticated;
CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin_update ON public.settings FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- Organizations: the admin creates them through the API (V1 grants), minus dropped columns.
REVOKE INSERT, UPDATE ON public.organizations FROM authenticated, service_role;
GRANT INSERT (name, document) ON public.organizations TO authenticated;
GRANT UPDATE (name, document, status) ON public.organizations TO authenticated;

-- Top-up requests ----------------------------------------------------------------------------
CREATE TYPE public.topup_request_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE public.topup_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),
    status public.topup_request_status NOT NULL DEFAULT 'pending',
    -- Audit only: no foreign keys, so deleting a user keeps the history.
    requested_by uuid NOT NULL,
    decided_by uuid,
    decided_at timestamptz,
    cancel_reason text CHECK (btrim(cancel_reason) <> '' AND length(cancel_reason) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT topup_requests_decision CHECK ((status = 'pending') = (decided_at IS NULL)),
    CONSTRAINT topup_requests_cancel_reason CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX topup_requests_organization_created_idx
    ON public.topup_requests (organization_id, created_at DESC);
CREATE INDEX topup_requests_pending_idx ON public.topup_requests (created_at)
    WHERE status = 'pending';

ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;
-- Read-only through the API: every change goes through the functions below.
GRANT SELECT ON public.topup_requests TO authenticated;
CREATE POLICY topup_requests_select ON public.topup_requests FOR SELECT TO authenticated
    USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Balance view: without consumption, the balance is everything credited minus corrections.
DROP VIEW public.organization_balances;
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

-- A customer asks for a top-up of the given amount.
CREATE FUNCTION public.request_topup(p_amount_cents bigint) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    c_max_pending_requests constant integer := 3;
    v_organization_id uuid := public.current_organization_id();
    v_status public.organization_status;
    v_settings public.settings%ROWTYPE;
    v_pending_count integer;
    v_request_id uuid;
BEGIN
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'caller has no organization' USING ERRCODE = '42501';
    END IF;

    SELECT o.status INTO v_status FROM public.organizations o
     WHERE o.id = v_organization_id
       FOR UPDATE;
    IF v_status <> 'active' THEN
        RAISE EXCEPTION 'organization % is %', v_organization_id, v_status USING ERRCODE = 'P0010';
    END IF;

    SELECT * INTO v_settings FROM public.settings;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'settings row is missing' USING ERRCODE = 'P0002';
    END IF;
    IF v_settings.pix_key IS NULL OR v_settings.pix_receiver_name IS NULL THEN
        RAISE EXCEPTION 'pix receiving data is not configured' USING ERRCODE = 'P0016';
    END IF;
    IF p_amount_cents IS NULL
       OR p_amount_cents < v_settings.minimum_topup_cents
       OR p_amount_cents > v_settings.maximum_topup_cents THEN
        RAISE EXCEPTION 'amount must be between % and % cents, got %',
            v_settings.minimum_topup_cents, v_settings.maximum_topup_cents, p_amount_cents
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_pending_count FROM public.topup_requests r
     WHERE r.organization_id = v_organization_id AND r.status = 'pending';
    IF v_pending_count >= c_max_pending_requests THEN
        RAISE EXCEPTION 'organization already has % pending requests (limit %)',
            v_pending_count, c_max_pending_requests USING ERRCODE = 'P0015';
    END IF;

    INSERT INTO public.topup_requests (organization_id, amount_cents, requested_by)
    VALUES (v_organization_id, p_amount_cents, auth.uid())
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.request_topup(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_topup(bigint) TO authenticated;

-- The admin confirms a paid request: marks it confirmed and credits the ledger once.
-- Confirming an already confirmed request returns false and credits nothing.
CREATE FUNCTION public.admin_confirm_topup(p_request_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_request public.topup_requests%ROWTYPE;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can confirm top-ups' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_request FROM public.topup_requests r WHERE r.id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_request.status = 'confirmed' THEN
        RETURN false;
    END IF;
    IF v_request.status = 'cancelled' THEN
        RAISE EXCEPTION 'top-up request % was cancelled', p_request_id USING ERRCODE = 'P0014';
    END IF;

    UPDATE public.topup_requests
       SET status = 'confirmed', decided_by = auth.uid(), decided_at = now()
     WHERE id = p_request_id;

    INSERT INTO public.wallet_transactions (
        organization_id, type, amount_cents, reference_id, description, created_by
    ) VALUES (
        v_request.organization_id, 'topup', v_request.amount_cents, p_request_id,
        'Recarga via Pix', auth.uid()
    );

    RETURN true;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_topup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_topup(uuid) TO authenticated;

-- The admin refuses a pending request (payment never arrived, wrong amount...).
CREATE FUNCTION public.admin_cancel_topup(p_request_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_status public.topup_request_status;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can cancel top-ups' USING ERRCODE = '42501';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' OR length(btrim(p_reason)) > 500 THEN
        RAISE EXCEPTION 'reason is required and must have at most 500 characters'
            USING ERRCODE = '22023';
    END IF;

    SELECT r.status INTO v_status FROM public.topup_requests r WHERE r.id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'top-up request % is %, only pending requests can be cancelled',
            p_request_id, v_status USING ERRCODE = 'P0014';
    END IF;

    UPDATE public.topup_requests
       SET status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
           cancel_reason = btrim(p_reason)
     WHERE id = p_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_topup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_topup(uuid, text) TO authenticated;

-- Links an account created in the Nelcota panel to an organization. Nelcota has no API to
-- create users, so the login is created there and linked here by e-mail.
CREATE FUNCTION public.admin_link_user(p_email text, p_organization_id uuid, p_name text)
    RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_current_organization_id uuid;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can link users' USING ERRCODE = '42501';
    END IF;
    IF p_name IS NULL OR btrim(p_name) = '' OR length(btrim(p_name)) > 200 THEN
        RAISE EXCEPTION 'name is required and must have at most 200 characters'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.organizations o WHERE o.id = p_organization_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization % not found', p_organization_id USING ERRCODE = 'P0002';
    END IF;

    SELECT u.id INTO v_user_id FROM auth.users u WHERE lower(u.email) = lower(btrim(p_email));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no account with this e-mail; create it in the Nelcota panel first'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT p.organization_id INTO v_current_organization_id
      FROM public.profiles p WHERE p.user_id = v_user_id;
    IF FOUND THEN
        RAISE EXCEPTION 'this account is already linked (organization %)', v_current_organization_id
            USING ERRCODE = 'P0014';
    END IF;

    INSERT INTO public.profiles (user_id, organization_id, name)
    VALUES (v_user_id, p_organization_id, btrim(p_name));

    RETURN v_user_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_link_user(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_link_user(text, uuid, text) TO authenticated;

-- Credited amount per month (Sao Paulo calendar), oldest first, including empty months.
-- SECURITY INVOKER: RLS scopes it to the caller's organization, or the whole platform for
-- the admin.
CREATE FUNCTION public.get_monthly_topups(p_months integer)
    RETURNS TABLE (month date, topup_cents bigint)
    LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
    c_max_months constant integer := 36;
    v_first_month date;
BEGIN
    IF p_months IS NULL OR p_months < 1 OR p_months > c_max_months THEN
        RAISE EXCEPTION 'months must be between 1 and %, got %', c_max_months, p_months
            USING ERRCODE = '22023';
    END IF;

    v_first_month := (internal.current_month_start() AT TIME ZONE 'America/Sao_Paulo')::date
        - make_interval(months => p_months - 1);

    RETURN QUERY
    WITH monthly AS (
        SELECT date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS month,
               sum(t.amount_cents) AS total
          FROM public.wallet_transactions t
         WHERE t.type = 'topup'
           AND t.created_at >= v_first_month::timestamp AT TIME ZONE 'America/Sao_Paulo'
         GROUP BY 1
    )
    SELECT m.month::date, coalesce(monthly.total, 0)::bigint
      FROM generate_series(v_first_month, v_first_month + make_interval(months => p_months - 1),
                           interval '1 month') AS m (month)
      LEFT JOIN monthly ON monthly.month = m.month::date
     ORDER BY 1;
END
$$;
REVOKE EXECUTE ON FUNCTION public.get_monthly_topups(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_topups(integer) TO authenticated;
