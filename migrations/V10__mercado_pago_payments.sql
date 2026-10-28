-- Online payments through Mercado Pago: Pix with an automatic QR Code and credit card.
-- A customer starts a top-up here; the app server creates the payment at Mercado Pago and
-- reports every status it learns (payment response, webhook, polling) to
-- apply_mercado_pago_status, which credits the ledger once when the payment is approved.
--
-- New error code:
--   P0019  the request already belongs to another Mercado Pago payment

CREATE TYPE public.topup_payment_method AS ENUM ('manual_pix', 'pix', 'card');

ALTER TABLE public.topup_requests
    ADD COLUMN payment_method public.topup_payment_method NOT NULL DEFAULT 'manual_pix',
    ADD COLUMN provider_payment_id text UNIQUE
        CHECK (btrim(provider_payment_id) <> '' AND length(provider_payment_id) <= 40),
    ADD COLUMN provider_status text
        CHECK (btrim(provider_status) <> '' AND length(provider_status) <= 40),
    -- Pix "copia e cola" code and its deadline, so the customer can reopen the QR Code.
    ADD COLUMN pix_qr_code text CHECK (btrim(pix_qr_code) <> '' AND length(pix_qr_code) <= 1000),
    ADD COLUMN pix_expires_at timestamptz;

-- A customer starts an online top-up (Pix or card) of the given amount.
CREATE FUNCTION public.start_online_topup(
    p_amount_cents bigint,
    p_payment_method public.topup_payment_method
)
    RETURNS uuid
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
    IF p_payment_method IS NULL OR p_payment_method = 'manual_pix' THEN
        RAISE EXCEPTION 'online top-ups are paid by pix or card, got %', p_payment_method
            USING ERRCODE = '22023';
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
    IF p_amount_cents IS NULL
       OR p_amount_cents < v_settings.minimum_topup_cents
       OR p_amount_cents > v_settings.maximum_topup_cents THEN
        RAISE EXCEPTION 'amount must be between % and % cents, got %',
            v_settings.minimum_topup_cents, v_settings.maximum_topup_cents, p_amount_cents
            USING ERRCODE = '22023';
    END IF;

    -- Unpaid Pix codes past their deadline no longer count against the limit. If one is
    -- paid later anyway, apply_mercado_pago_status still credits it.
    UPDATE public.topup_requests
       SET status = 'cancelled', cancel_reason = 'O prazo do Pix acabou.', decided_at = now()
     WHERE organization_id = v_organization_id
       AND status = 'pending'
       AND payment_method = 'pix'
       AND pix_expires_at < now();

    SELECT count(*) INTO v_pending_count FROM public.topup_requests r
     WHERE r.organization_id = v_organization_id AND r.status = 'pending';
    IF v_pending_count >= c_max_pending_requests THEN
        RAISE EXCEPTION 'organization already has % pending requests (limit %)',
            v_pending_count, c_max_pending_requests USING ERRCODE = 'P0015';
    END IF;

    INSERT INTO public.topup_requests (organization_id, amount_cents, requested_by, payment_method)
    VALUES (v_organization_id, p_amount_cents, auth.uid(), p_payment_method)
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.start_online_topup(bigint, public.topup_payment_method) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_online_topup(bigint, public.topup_payment_method)
    TO authenticated;

-- The app server links the request to the payment it created at Mercado Pago.
CREATE FUNCTION public.record_mercado_pago_payment(
    p_request_id uuid,
    p_provider_payment_id text,
    p_pix_qr_code text,
    p_pix_expires_at timestamptz
)
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_request public.topup_requests%ROWTYPE;
BEGIN
    IF p_provider_payment_id IS NULL OR btrim(p_provider_payment_id) = '' THEN
        RAISE EXCEPTION 'provider payment id is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_request FROM public.topup_requests r WHERE r.id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_request.provider_payment_id IS NOT NULL
       AND v_request.provider_payment_id <> p_provider_payment_id THEN
        RAISE EXCEPTION 'request % already belongs to payment %',
            p_request_id, v_request.provider_payment_id USING ERRCODE = 'P0019';
    END IF;

    UPDATE public.topup_requests
       SET provider_payment_id = p_provider_payment_id,
           pix_qr_code = coalesce(p_pix_qr_code, pix_qr_code),
           pix_expires_at = coalesce(p_pix_expires_at, pix_expires_at)
     WHERE id = p_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.record_mercado_pago_payment(uuid, text, text, timestamptz)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_mercado_pago_payment(uuid, text, text, timestamptz)
    TO service_role;

-- Applies a payment status read from Mercado Pago (never from the webhook body itself).
-- Approved credits the ledger once, even for a request that had expired or been withdrawn,
-- because the money was received. Rejected or cancelled closes a pending request.
-- Refunds and chargebacks are only recorded: the admin reviews them.
-- Returns the request status after the change.
CREATE FUNCTION public.apply_mercado_pago_status(
    p_request_id uuid,
    p_provider_payment_id text,
    p_provider_status text,
    p_amount_cents bigint
)
    RETURNS public.topup_request_status
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_request public.topup_requests%ROWTYPE;
    v_description text;
BEGIN
    IF p_provider_status IS NULL OR btrim(p_provider_status) = ''
       OR length(p_provider_status) > 40 THEN
        RAISE EXCEPTION 'provider status is required (at most 40 characters)'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_request FROM public.topup_requests r WHERE r.id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_request.payment_method = 'manual_pix' THEN
        RAISE EXCEPTION 'request % is a manual pix request', p_request_id USING ERRCODE = 'P0014';
    END IF;
    IF v_request.provider_payment_id IS NOT NULL
       AND v_request.provider_payment_id <> p_provider_payment_id THEN
        RAISE EXCEPTION 'request % belongs to payment %, not %',
            p_request_id, v_request.provider_payment_id, p_provider_payment_id
            USING ERRCODE = 'P0019';
    END IF;

    UPDATE public.topup_requests
       SET provider_payment_id = p_provider_payment_id, provider_status = p_provider_status
     WHERE id = p_request_id;

    IF p_provider_status = 'approved' THEN
        IF v_request.status = 'confirmed' THEN
            RETURN 'confirmed';
        END IF;
        IF p_amount_cents IS DISTINCT FROM v_request.amount_cents THEN
            RAISE EXCEPTION 'payment % paid % cents but request % is for % cents',
                p_provider_payment_id, p_amount_cents, p_request_id, v_request.amount_cents
                USING ERRCODE = '22023';
        END IF;
        UPDATE public.topup_requests
           SET status = 'confirmed', cancel_reason = NULL, decided_by = NULL, decided_at = now()
         WHERE id = p_request_id;
        v_description := CASE v_request.payment_method
            WHEN 'card' THEN 'Recarga via cartão de crédito'
            ELSE 'Recarga via Pix'
        END;
        INSERT INTO public.wallet_transactions (
            organization_id, type, amount_cents, reference_id, description
        ) VALUES (
            v_request.organization_id, 'topup', v_request.amount_cents, p_request_id, v_description
        );
        RETURN 'confirmed';
    END IF;

    IF p_provider_status IN ('rejected', 'cancelled') AND v_request.status = 'pending' THEN
        UPDATE public.topup_requests
           SET status = 'cancelled',
               cancel_reason = CASE v_request.payment_method
                   WHEN 'card' THEN 'O pagamento com cartão não foi aprovado.'
                   ELSE 'O prazo do Pix acabou.'
               END,
               decided_at = now()
         WHERE id = p_request_id;
        RETURN 'cancelled';
    END IF;

    RETURN v_request.status;
END
$$;
REVOKE EXECUTE ON FUNCTION public.apply_mercado_pago_status(uuid, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_mercado_pago_status(uuid, text, text, bigint)
    TO service_role;

-- The app server reads the request (amount, method, organization) before creating the payment.
GRANT SELECT ON public.topup_requests TO service_role;
GRANT SELECT ON public.organizations TO service_role;
