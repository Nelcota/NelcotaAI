-- Manual top-ups, balance adjustments, account linking and the read models of the dashboards.
-- Every write to wallet_transactions and topup_requests happens in a SECURITY DEFINER function
-- here or in V3; the caller comes from the JWT (auth.uid()), never from a parameter.
--
-- Error codes (returned by the API as `sqlstate`, so the app can show a friendly message):
--   22023  invalid argument (empty, out of range)
--   P0002  referenced row not found
--   42501  caller is not allowed (not a platform admin, or not signed in)
--   P0010  organization is blocked
--   P0012  adjustment would leave a negative balance
--   P0014  row is in a state that does not allow the operation
--   P0015  too many pending top-up requests for the organization
--   P0016  Pix receiving data is not configured yet
--   P0017  payment reference already used on another request
--   P0018  an organization with this document already exists
--   P0019  the request already belongs to another Mercado Pago payment (V3)
--   P0020  an unfinished online payment must be recovered first (V3)

-- Self sign-up: the customer creates the login with the Nelcota auth API and then registers the
-- company here, becoming its owner. The admin can still block the organization afterwards.
CREATE FUNCTION public.register_my_organization(
    p_person_name text,
    p_organization_name text,
    p_document text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_organization_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'sign in before registering an organization' USING ERRCODE = '42501';
    END IF;
    IF p_person_name IS NULL OR btrim(p_person_name) = '' OR length(btrim(p_person_name)) > 200 THEN
        RAISE EXCEPTION 'person name is required and must have at most 200 characters'
            USING ERRCODE = '22023';
    END IF;
    IF p_organization_name IS NULL OR btrim(p_organization_name) = ''
       OR length(btrim(p_organization_name)) > 200 THEN
        RAISE EXCEPTION 'organization name is required and must have at most 200 characters'
            USING ERRCODE = '22023';
    END IF;
    IF p_document IS NULL OR p_document !~ '^([0-9]{11}|[0-9]{14})$' THEN
        RAISE EXCEPTION 'document must have 11 (CPF) or 14 (CNPJ) digits' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.profiles p WHERE p.user_id = v_user_id;
    IF FOUND THEN
        RAISE EXCEPTION 'this account already belongs to an organization' USING ERRCODE = 'P0014';
    END IF;

    -- Checked up front for a clear error; the UNIQUE constraint still guards concurrent sign-ups.
    PERFORM 1 FROM public.organizations o WHERE o.document = p_document;
    IF FOUND THEN
        RAISE EXCEPTION 'an organization with this document already exists' USING ERRCODE = 'P0018';
    END IF;

    INSERT INTO public.organizations (name, document)
    VALUES (btrim(p_organization_name), p_document)
    RETURNING id INTO v_organization_id;

    INSERT INTO public.profiles (user_id, organization_id, name, role)
    VALUES (v_user_id, v_organization_id, btrim(p_person_name), 'owner');

    RETURN v_organization_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.register_my_organization(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_my_organization(text, text, text) TO authenticated;

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

-- Removes a person's access to their organization. The login stays in Nelcota; signing in again
-- asks them to register a company, as a brand-new account would.
CREATE FUNCTION public.admin_unlink_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can remove access' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_profile FROM public.profiles p WHERE p.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account % is not linked to any organization', p_user_id
            USING ERRCODE = 'P0002';
    END IF;
    IF v_profile.is_platform_admin THEN
        RAISE EXCEPTION 'account % is a platform admin, not a customer', p_user_id
            USING ERRCODE = 'P0014';
    END IF;

    DELETE FROM public.profiles WHERE user_id = p_user_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_unlink_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unlink_user(uuid) TO authenticated;

-- Manual balance adjustment by the platform admin.
CREATE FUNCTION public.admin_adjust_balance(
    p_organization_id uuid,
    p_amount_cents bigint,
    p_description text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    -- R$ 1.000.000,00: guards against a typo adding or removing an absurd amount.
    c_max_adjustment_cents constant bigint := 100000000;
    v_balance_cents bigint;
    v_transaction_id uuid;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can adjust balances' USING ERRCODE = '42501';
    END IF;
    IF p_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization is required' USING ERRCODE = '22023';
    END IF;
    IF p_amount_cents IS NULL OR p_amount_cents = 0 OR abs(p_amount_cents) > c_max_adjustment_cents THEN
        RAISE EXCEPTION 'amount must be non-zero and at most % cents in absolute value, got %',
            c_max_adjustment_cents, p_amount_cents USING ERRCODE = '22023';
    END IF;
    IF p_description IS NULL OR btrim(p_description) = '' OR length(btrim(p_description)) > 500 THEN
        RAISE EXCEPTION 'description is required and must have at most 500 characters'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.organizations o WHERE o.id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization % not found', p_organization_id USING ERRCODE = 'P0002';
    END IF;

    SELECT coalesce(sum(t.amount_cents), 0) INTO v_balance_cents
      FROM public.wallet_transactions t
     WHERE t.organization_id = p_organization_id;
    IF v_balance_cents + p_amount_cents < 0 THEN
        RAISE EXCEPTION 'adjustment of % cents would leave a negative balance (current % cents)',
            p_amount_cents, v_balance_cents USING ERRCODE = 'P0012';
    END IF;

    INSERT INTO public.wallet_transactions (
        organization_id, type, amount_cents, description, created_by
    ) VALUES (
        p_organization_id, 'adjustment', p_amount_cents, btrim(p_description), auth.uid()
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, bigint, text) TO authenticated;

-- Manual Pix requests -------------------------------------------------------------------------

-- A customer asks for a top-up that they will pay to the company's Pix key. The Pix code needs
-- key, receiver and city, so requests wait for all three.
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
    IF v_settings.pix_key IS NULL OR v_settings.pix_receiver_name IS NULL OR v_settings.pix_city IS NULL THEN
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

-- The customer withdraws their own pending request (for example, they decided not to pay).
-- An online request whose gateway call may have started must be reconciled first, otherwise
-- the customer could withdraw it and unknowingly submit a second charge.
CREATE FUNCTION public.cancel_my_topup(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_organization_id uuid := public.current_organization_id();
    v_request public.topup_requests%ROWTYPE;
BEGIN
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'caller has no organization' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_request FROM public.topup_requests r
     WHERE r.id = p_request_id AND r.organization_id = v_organization_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'top-up request % is %, only pending requests can be withdrawn',
            p_request_id, v_request.status USING ERRCODE = 'P0014';
    END IF;
    IF v_request.payment_prepared_at IS NOT NULL AND v_request.provider_payment_id IS NULL THEN
        RAISE EXCEPTION 'payment creation must be reconciled before withdrawal' USING ERRCODE = 'P0020';
    END IF;

    UPDATE public.topup_requests
       SET status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
     WHERE id = p_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_my_topup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_my_topup(uuid) TO authenticated;

-- Links an uploaded receipt to the customer's pending request. The file must already be in
-- the request's folder of the receipts bucket.
CREATE FUNCTION public.attach_topup_receipt(p_request_id uuid, p_receipt_path text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_organization_id uuid := public.current_organization_id();
    v_status public.topup_request_status;
BEGIN
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'caller has no organization' USING ERRCODE = '42501';
    END IF;
    IF p_receipt_path IS NULL
       OR p_receipt_path NOT LIKE v_organization_id::text || '/' || p_request_id::text || '/%'
       OR length(p_receipt_path) > 300 THEN
        RAISE EXCEPTION 'receipt path must be inside the request folder' USING ERRCODE = '22023';
    END IF;

    SELECT r.status INTO v_status FROM public.topup_requests r
     WHERE r.id = p_request_id AND r.organization_id = v_organization_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'top-up request % is %, receipts are only accepted while pending',
            p_request_id, v_status USING ERRCODE = 'P0014';
    END IF;

    PERFORM 1 FROM storage.objects o
     WHERE o.bucket_id = 'receipts' AND o.name = p_receipt_path;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'receipt file % was not uploaded', p_receipt_path USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.topup_requests SET receipt_path = p_receipt_path WHERE id = p_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.attach_topup_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_topup_receipt(uuid, text) TO authenticated;

-- One payment, one credit --------------------------------------------------------------------
-- A manual payment reference and a Mercado Pago payment id share one identity space: the admin
-- could type the id of a payment the provider already credited. Both credit paths take the
-- same transaction-scoped lock on that identity before checking either column, which
-- serializes a manual confirmation with a concurrent provider approval.

-- The other request that already holds this payment, or null.
CREATE FUNCTION internal.find_other_topup_payment(p_reference text, p_request_id uuid)
    RETURNS uuid
    LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
    v_other_request_id uuid;
BEGIN
    IF p_reference IS NULL THEN
        RETURN NULL;
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('topup-payment:' || p_reference, 0)
    );
    SELECT r.id INTO v_other_request_id FROM public.topup_requests r
     WHERE r.id <> p_request_id
       AND (r.payment_reference = p_reference OR r.provider_payment_id = p_reference)
     LIMIT 1;
    RETURN v_other_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION internal.find_other_topup_payment(text, uuid) FROM PUBLIC;

-- Manual confirmations reject a reused reference (P0017); provider reconciliation (V3) records
-- a terminal duplicate instead.
CREATE FUNCTION internal.require_unused_topup_payment(p_reference text, p_request_id uuid)
    RETURNS void
    LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
    v_other_request_id uuid := internal.find_other_topup_payment(p_reference, p_request_id);
BEGIN
    IF v_other_request_id IS NOT NULL THEN
        RAISE EXCEPTION 'payment reference % already belongs to request %',
            p_reference, v_other_request_id USING ERRCODE = 'P0017';
    END IF;
END
$$;
REVOKE EXECUTE ON FUNCTION internal.require_unused_topup_payment(text, uuid) FROM PUBLIC;

-- The admin confirms a paid manual request: marks it confirmed, records the payment reference
-- (for example, the bank transaction id) and credits the ledger once. Confirming an already
-- confirmed request returns false and credits nothing.
CREATE FUNCTION public.admin_confirm_topup(p_request_id uuid, p_payment_reference text DEFAULT NULL)
    RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_request public.topup_requests%ROWTYPE;
    v_reference text := nullif(btrim(p_payment_reference), '');
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can confirm top-ups' USING ERRCODE = '42501';
    END IF;
    IF length(v_reference) > 120 THEN
        RAISE EXCEPTION 'payment reference must have at most 120 characters' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_request FROM public.topup_requests r WHERE r.id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_request.payment_method <> 'manual_pix' THEN
        RAISE EXCEPTION 'online payments must be reconciled with the provider' USING ERRCODE = 'P0014';
    END IF;
    IF v_request.status = 'confirmed' THEN
        RETURN false;
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'top-up request % is %', p_request_id, v_request.status
            USING ERRCODE = 'P0014';
    END IF;

    PERFORM internal.require_unused_topup_payment(v_reference, p_request_id);

    UPDATE public.topup_requests
       SET status = 'confirmed', decided_by = auth.uid(), decided_at = now(),
           payment_reference = v_reference
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
REVOKE EXECUTE ON FUNCTION public.admin_confirm_topup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_topup(uuid, text) TO authenticated;

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

-- Read models ----------------------------------------------------------------------------------
-- All SECURITY INVOKER: RLS scopes them to the caller's organization, or to the whole platform
-- for the admin.

-- Credited amount per month (Sao Paulo calendar), oldest first, including empty months.
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

-- Balance, credited count and last credit of one organization; null when RLS hides it.
CREATE FUNCTION public.get_organization_topup_summary(p_organization_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'balance_cents', b.balance_cents,
        'month_topup_cents', b.month_topup_cents,
        'credited_count', (SELECT count(*) FROM public.wallet_transactions t
                           WHERE t.organization_id = b.organization_id AND t.type = 'topup'),
        'last_credit_cents', last_credit.amount_cents,
        'last_credit_at', last_credit.created_at
    )
    FROM public.organization_balances b
    LEFT JOIN LATERAL (
        SELECT t.amount_cents, t.created_at FROM public.wallet_transactions t
         WHERE t.organization_id = b.organization_id AND t.type = 'topup'
         ORDER BY t.created_at DESC, t.id DESC LIMIT 1
    ) last_credit ON true
    WHERE b.organization_id = p_organization_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_organization_topup_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_topup_summary(uuid) TO authenticated;

-- Credited amount of the given months (Sao Paulo calendar), by the ledger date.
CREATE FUNCTION public.get_topup_month_totals(p_organization_id uuid, p_months date[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
    SELECT coalesce(
        jsonb_agg(jsonb_build_object('month', month, 'topup_cents', topup_cents) ORDER BY month),
        '[]'::jsonb
    )
    FROM (
        SELECT date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS month,
               sum(t.amount_cents)::bigint AS topup_cents
          FROM public.wallet_transactions t
         WHERE t.organization_id = p_organization_id AND t.type = 'topup'
           AND date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = ANY (p_months)
         GROUP BY 1
    ) totals;
$$;
REVOKE EXECUTE ON FUNCTION public.get_topup_month_totals(uuid, date[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topup_month_totals(uuid, date[]) TO authenticated;

-- Platform indicators for the admin overview, unaffected by the page limits of the listings.
CREATE FUNCTION public.get_platform_topup_summary() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'platform administrator required' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'organization_count', (SELECT count(*) FROM public.organizations),
        'active_organization_count', (SELECT count(*) FROM public.organizations WHERE status = 'active'),
        'month_topup_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.wallet_transactions
                              WHERE type = 'topup' AND created_at >= internal.current_month_start()),
        'pending_count', (SELECT count(*) FROM public.topup_requests
                          WHERE status = 'pending' AND payment_method = 'manual_pix'),
        'pending_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.topup_requests
                          WHERE status = 'pending' AND payment_method = 'manual_pix')
    );
END
$$;
REVOKE EXECUTE ON FUNCTION public.get_platform_topup_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_topup_summary() TO authenticated;
