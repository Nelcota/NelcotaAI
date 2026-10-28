-- Atomic money movements. Every write to wallet_transactions happens here.
--
-- Error codes (returned by the API as `sqlstate`, so the app can show a friendly message):
--   22023  invalid argument (empty, out of range)
--   P0002  referenced row not found
--   42501  caller is not allowed (not a platform admin)
--   P0010  organization is blocked
--   P0011  generations-per-minute rate limit reached
--   P0012  insufficient balance
--   P0013  monthly spend limit reached
--   P0014  row is in a state that does not allow the operation

-- Debits the generation price and creates the pending generation in one transaction.
-- Locking the organization row serializes concurrent reservations of the same organization,
-- so two requests can never spend the same balance or both slip under the rate limit.
CREATE FUNCTION public.reserve_generation(
    p_organization_id uuid,
    p_user_id uuid,
    p_pricing_id uuid,
    p_prompt text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_status public.organization_status;
    v_monthly_limit_cents bigint;
    v_price public.pricing%ROWTYPE;
    v_rate_limit integer;
    v_recent_count integer;
    v_balance_cents bigint;
    v_month_spend_cents bigint;
    v_generation_id uuid;
BEGIN
    IF p_organization_id IS NULL OR p_user_id IS NULL OR p_pricing_id IS NULL THEN
        RAISE EXCEPTION 'organization, user and pricing are required' USING ERRCODE = '22023';
    END IF;
    IF p_prompt IS NULL OR btrim(p_prompt) = '' THEN
        RAISE EXCEPTION 'prompt must not be empty' USING ERRCODE = '22023';
    END IF;

    SELECT o.status, o.monthly_spend_limit_cents
      INTO v_status, v_monthly_limit_cents
      FROM public.organizations o
     WHERE o.id = p_organization_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization % not found', p_organization_id USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'active' THEN
        RAISE EXCEPTION 'organization % is %', p_organization_id, v_status USING ERRCODE = 'P0010';
    END IF;

    PERFORM 1 FROM public.profiles p
     WHERE p.user_id = p_user_id AND p.organization_id = p_organization_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user % does not belong to organization %', p_user_id, p_organization_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_price FROM public.pricing pr WHERE pr.id = p_pricing_id AND pr.active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pricing % not found or inactive', p_pricing_id USING ERRCODE = 'P0002';
    END IF;

    SELECT s.generations_per_minute_limit INTO v_rate_limit FROM public.settings s;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'settings row is missing' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) INTO v_recent_count
      FROM public.generations g
     WHERE g.organization_id = p_organization_id
       AND g.created_at > now() - interval '1 minute';
    IF v_recent_count >= v_rate_limit THEN
        RAISE EXCEPTION 'rate limit reached: % generations in the last minute (limit %)',
            v_recent_count, v_rate_limit USING ERRCODE = 'P0011';
    END IF;

    SELECT coalesce(sum(t.amount_cents), 0) INTO v_balance_cents
      FROM public.wallet_transactions t
     WHERE t.organization_id = p_organization_id;
    IF v_balance_cents < v_price.price_cents THEN
        RAISE EXCEPTION 'insufficient balance: % cents available, % cents required',
            v_balance_cents, v_price.price_cents USING ERRCODE = 'P0012';
    END IF;

    IF v_monthly_limit_cents IS NOT NULL THEN
        SELECT coalesce(-sum(t.amount_cents), 0) INTO v_month_spend_cents
          FROM public.wallet_transactions t
         WHERE t.organization_id = p_organization_id
           AND t.type IN ('usage', 'refund')
           AND t.created_at >= internal.current_month_start();
        IF v_month_spend_cents + v_price.price_cents > v_monthly_limit_cents THEN
            RAISE EXCEPTION 'monthly spend limit reached: % of % cents spent, % cents required',
                v_month_spend_cents, v_monthly_limit_cents, v_price.price_cents
                USING ERRCODE = 'P0013';
        END IF;
    END IF;

    INSERT INTO public.generations (
        organization_id, user_id, prompt, model, size, quality,
        price_cents, openai_cost_usd, usd_brl_rate
    ) VALUES (
        p_organization_id, p_user_id, btrim(p_prompt), v_price.model, v_price.size, v_price.quality,
        v_price.price_cents, v_price.openai_cost_usd, v_price.usd_brl_rate
    )
    RETURNING id INTO v_generation_id;

    INSERT INTO public.wallet_transactions (
        organization_id, type, amount_cents, reference_id, description, created_by
    ) VALUES (
        p_organization_id, 'usage', -v_price.price_cents, v_generation_id, 'Geração de imagem', p_user_id
    );

    RETURN v_generation_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_generation(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid, uuid, uuid, text) TO service_role;

-- Returns the debited amount of a failed generation. Safe to call many times: only the first
-- call credits (unique index on type + reference_id); later calls return false.
CREATE FUNCTION public.refund_generation(p_generation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_organization_id uuid;
    v_status public.generation_status;
    v_debited_cents bigint;
    v_inserted_count integer;
BEGIN
    SELECT g.organization_id, g.status INTO v_organization_id, v_status
      FROM public.generations g
     WHERE g.id = p_generation_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'generation % not found', p_generation_id USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'failed' THEN
        RAISE EXCEPTION 'generation % is %, only failed generations can be refunded',
            p_generation_id, v_status USING ERRCODE = 'P0014';
    END IF;

    SELECT -t.amount_cents INTO v_debited_cents
      FROM public.wallet_transactions t
     WHERE t.type = 'usage' AND t.reference_id = p_generation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'generation % has no usage debit to refund', p_generation_id
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.wallet_transactions (
        organization_id, type, amount_cents, reference_id, description
    ) VALUES (
        v_organization_id, 'refund', v_debited_cents, p_generation_id, 'Estorno de geração'
    )
    ON CONFLICT (type, reference_id) WHERE type IN ('topup', 'usage', 'refund') DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    RETURN v_inserted_count = 1;
END
$$;
REVOKE EXECUTE ON FUNCTION public.refund_generation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_generation(uuid) TO service_role;

-- Credits a confirmed Asaas payment. Safe to call many times (webhook retries, reconciliation
-- job): only the first call credits; later calls return false.
CREATE FUNCTION public.credit_topup(p_asaas_payment_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_payment public.payments%ROWTYPE;
    v_inserted_count integer;
BEGIN
    IF p_asaas_payment_id IS NULL OR btrim(p_asaas_payment_id) = '' THEN
        RAISE EXCEPTION 'asaas payment id must not be empty' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_payment
      FROM public.payments p
     WHERE p.asaas_payment_id = p_asaas_payment_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment % not found', p_asaas_payment_id USING ERRCODE = 'P0002';
    END IF;
    IF v_payment.status NOT IN ('RECEIVED', 'CONFIRMED') THEN
        RAISE EXCEPTION 'payment % is %, only RECEIVED or CONFIRMED payments are credited',
            p_asaas_payment_id, v_payment.status USING ERRCODE = 'P0014';
    END IF;

    INSERT INTO public.wallet_transactions (
        organization_id, type, amount_cents, reference_id, description
    ) VALUES (
        v_payment.organization_id,
        'topup',
        v_payment.amount_cents,
        v_payment.id,
        CASE v_payment.method WHEN 'pix' THEN 'Recarga via Pix' ELSE 'Recarga via cartão' END
    )
    ON CONFLICT (type, reference_id) WHERE type IN ('topup', 'usage', 'refund') DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    RETURN v_inserted_count = 1;
END
$$;
REVOKE EXECUTE ON FUNCTION public.credit_topup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_topup(text) TO service_role;

-- Manual balance adjustment by the platform admin. Callable by authenticated users so the
-- database itself enforces who may adjust: the caller must be a platform admin, and the
-- author comes from the JWT (auth.uid()), never from a parameter that could be forged.
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
