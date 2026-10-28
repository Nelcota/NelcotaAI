-- A duplicate provider observation must commit its identity and close the losing attempt.
-- Raising P0017 here used to roll back both recovery metadata and token cleanup.
ALTER TABLE public.topup_requests
    ADD COLUMN duplicate_of_request_id uuid REFERENCES public.topup_requests(id),
    ADD CONSTRAINT topup_requests_duplicate_closed CHECK (
        duplicate_of_request_id IS NULL OR (
            duplicate_of_request_id <> id AND status = 'cancelled' AND payment_method <> 'manual_pix'
        )
    );
CREATE INDEX topup_requests_duplicate_idx ON public.topup_requests(duplicate_of_request_id)
    WHERE duplicate_of_request_id IS NOT NULL;

CREATE FUNCTION internal.find_other_topup_payment(p_reference text, p_request_id uuid)
    RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_other_request_id uuid;
BEGIN
    IF p_reference IS NULL THEN RETURN NULL; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('topup-payment:' || p_reference, 0)
    );
    SELECT r.id INTO v_other_request_id FROM public.topup_requests r
     WHERE r.id <> p_request_id
       AND (r.payment_reference = p_reference OR r.provider_payment_id = p_reference)
     LIMIT 1;
    RETURN v_other_request_id;
END $$;
REVOKE EXECUTE ON FUNCTION internal.find_other_topup_payment(text, uuid) FROM PUBLIC;

-- Manual confirmations still reject reused references; provider reconciliation records a
-- terminal duplicate instead. Both paths retain the same transaction-scoped identity lock.
CREATE OR REPLACE FUNCTION internal.require_unused_topup_payment(p_reference text, p_request_id uuid)
    RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_other_request_id uuid;
BEGIN
    v_other_request_id := internal.find_other_topup_payment(p_reference, p_request_id);
    IF v_other_request_id IS NOT NULL THEN
        RAISE EXCEPTION 'payment reference % already belongs to request %',
            p_reference, v_other_request_id USING ERRCODE = 'P0017';
    END IF;
END $$;
REVOKE EXECUTE ON FUNCTION internal.require_unused_topup_payment(text, uuid) FROM PUBLIC;

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
    v_duplicate_request_id uuid;
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

    -- A later observation can update provider metadata, but never credit a resolved duplicate.
    IF v_request.duplicate_of_request_id IS NOT NULL THEN RETURN v_request.status; END IF;

    IF p_provider_status = 'approved' THEN
        IF v_request.status = 'confirmed' THEN
            RETURN 'confirmed';
        END IF;
        IF p_amount_cents IS DISTINCT FROM v_request.amount_cents THEN
            RAISE EXCEPTION 'payment % paid % cents but request % is for % cents',
                p_provider_payment_id, p_amount_cents, p_request_id, v_request.amount_cents
                USING ERRCODE = '22023';
        END IF;
        v_duplicate_request_id := internal.find_other_topup_payment(p_provider_payment_id, p_request_id);
        IF v_duplicate_request_id IS NOT NULL THEN
            UPDATE public.topup_requests
               SET status = 'cancelled', decided_at = now(), decided_by = NULL,
                   duplicate_of_request_id = v_duplicate_request_id,
                   cancel_reason = 'This payment is already linked to another top-up. Contact support to review the existing credit.'
             WHERE id = p_request_id;
            RETURN 'cancelled';
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

    IF p_provider_status IN ('refunded', 'charged_back') AND v_request.status = 'pending' THEN
        UPDATE public.topup_requests
           SET status = 'cancelled', decided_at = now(),
               cancel_reason = 'The payment was reversed before any credit was recorded.'
         WHERE id = p_request_id;
        RETURN 'cancelled';
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


