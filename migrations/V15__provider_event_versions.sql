-- V11 mixed application receipt times with provider event versions. Their provenance cannot
-- be recovered, so discard only this ordering metadata and rebuild it from provider observations.
-- Request decisions, provider statuses and immutable ledger entries are preserved.
UPDATE public.topup_requests SET provider_updated_at = NULL WHERE provider_updated_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_mercado_pago_status(
    p_request_id uuid,
    p_provider_payment_id text,
    p_provider_status text,
    p_amount_cents bigint,
    p_provider_updated_at timestamptz DEFAULT NULL
)
    RETURNS public.topup_request_status
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_request public.topup_requests%ROWTYPE;
    v_description text;
    v_updated_at timestamptz := p_provider_updated_at;
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

    IF p_provider_payment_id IS NULL OR btrim(p_provider_payment_id) = '' THEN
        RAISE EXCEPTION 'provider payment id is required' USING ERRCODE = '22023';
    END IF;
    IF v_request.provider_updated_at IS NOT NULL AND v_updated_at IS NOT NULL
       AND v_updated_at < v_request.provider_updated_at THEN
        RETURN v_request.status;
    END IF;
    -- Missing or equal timestamps must never erase a refund/chargeback warning.
    IF v_request.provider_status IN ('refunded', 'charged_back')
       AND p_provider_status NOT IN ('refunded', 'charged_back') THEN
        RETURN v_request.status;
    END IF;
    IF v_request.status = 'confirmed' AND p_provider_status IN ('pending', 'in_process', 'authorized') THEN
        RETURN v_request.status;
    END IF;

    UPDATE public.topup_requests
       SET provider_payment_id = p_provider_payment_id, provider_status = p_provider_status,
           provider_updated_at = coalesce(v_updated_at, provider_updated_at)
     WHERE id = p_request_id;
    DELETE FROM public.online_payment_attempts WHERE request_id = p_request_id;

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
            WHEN 'card' THEN 'Credit card top-up'
            ELSE 'Pix top-up'
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
                   WHEN 'card' THEN 'The card payment was not approved.'
                   ELSE 'The Pix payment was cancelled or rejected.'
               END,
               decided_at = now()
         WHERE id = p_request_id;
        RETURN 'cancelled';
    END IF;

    RETURN v_request.status;
END
$$;
REVOKE EXECUTE ON FUNCTION public.apply_mercado_pago_status(uuid, text, text, bigint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_mercado_pago_status(uuid, text, text, bigint, timestamptz)
    TO service_role;

