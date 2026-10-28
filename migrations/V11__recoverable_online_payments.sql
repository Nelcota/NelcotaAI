-- Durable, service-only payment payloads preserve the original idempotency key and body.
ALTER TABLE public.topup_requests
    ADD COLUMN provider_updated_at timestamptz,
    ADD COLUMN payment_prepared_at timestamptz;
-- Older unknown outcomes must be searched by external reference rather than treated as unsubmitted.
UPDATE public.topup_requests SET payment_prepared_at = created_at
 WHERE status = 'pending' AND payment_method <> 'manual_pix' AND provider_payment_id IS NULL;

CREATE TABLE public.online_payment_attempts (
    request_id uuid PRIMARY KEY REFERENCES public.topup_requests(id) ON DELETE CASCADE,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
    lease_until timestamptz
);
ALTER TABLE public.online_payment_attempts ENABLE ROW LEVEL SECURITY;
-- Tokenized card data is never exposed through customer/admin table reads.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_payment_attempts TO service_role;
CREATE POLICY online_payment_attempts_service ON public.online_payment_attempts TO service_role
    USING (true) WITH CHECK (true);

DROP FUNCTION public.start_online_topup(bigint, public.topup_payment_method);
DROP FUNCTION public.apply_mercado_pago_status(uuid, text, text, bigint);

CREATE FUNCTION public.start_online_topup(
    p_amount_cents bigint,
    p_payment_method public.topup_payment_method,
    p_attempt_id uuid DEFAULT NULL
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
    v_existing public.topup_requests%ROWTYPE;
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

    IF p_attempt_id IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.topup_requests WHERE id = p_attempt_id;
        IF FOUND THEN
            IF v_existing.organization_id <> v_organization_id
               OR v_existing.amount_cents <> p_amount_cents
               OR v_existing.payment_method <> p_payment_method THEN
                RAISE EXCEPTION 'attempt identity does not match the requested top-up' USING ERRCODE = '22023';
            END IF;
            RETURN v_existing.id;
        END IF;
    END IF;

    -- An unresolved external write must be recovered before starting another charge.
    SELECT * INTO v_existing FROM public.topup_requests
     WHERE organization_id = v_organization_id AND status = 'pending'
       AND payment_method <> 'manual_pix' AND provider_payment_id IS NULL
       AND payment_prepared_at IS NOT NULL
     ORDER BY created_at, id LIMIT 1;
    IF FOUND THEN
        IF v_existing.amount_cents = p_amount_cents AND v_existing.payment_method = p_payment_method THEN
            RETURN v_existing.id;
        END IF;
        RAISE EXCEPTION 'recover the unfinished payment before starting another top-up' USING ERRCODE = 'P0020';
    END IF;

    -- No gateway call can precede preparation. Abandoned, unprepared requests are safe to close.
    UPDATE public.topup_requests SET status = 'withdrawn', decided_at = now()
     WHERE organization_id = v_organization_id AND status = 'pending'
       AND payment_method <> 'manual_pix' AND payment_prepared_at IS NULL
       AND provider_payment_id IS NULL AND created_at < now() - interval '2 minutes';

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
       SET status = 'cancelled', cancel_reason = 'The Pix payment expired.', decided_at = now()
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

    INSERT INTO public.topup_requests (id, organization_id, amount_cents, requested_by, payment_method)
    VALUES (coalesce(p_attempt_id, gen_random_uuid()), v_organization_id, p_amount_cents, auth.uid(), p_payment_method)
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.start_online_topup(bigint, public.topup_payment_method, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_online_topup(bigint, public.topup_payment_method, uuid)
    TO authenticated;


CREATE FUNCTION public.prepare_online_payment(p_request_id uuid, p_payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request public.topup_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_request FROM public.topup_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_request.status <> 'pending' OR v_request.payment_method = 'manual_pix' THEN
        RAISE EXCEPTION 'top-up cannot accept a payment' USING ERRCODE = 'P0014';
    END IF;
    IF v_request.provider_payment_id IS NOT NULL THEN RETURN; END IF;
    IF p_payload->>'external_reference' IS DISTINCT FROM p_request_id::text
       OR (p_payload->>'transaction_amount')::numeric * 100 IS DISTINCT FROM v_request.amount_cents::numeric THEN
        RAISE EXCEPTION 'payment payload does not match the request' USING ERRCODE = '22023';
    END IF;
    -- Never overwrite the first payload: idempotency requires exactly the same operation.
    INSERT INTO public.online_payment_attempts(request_id, payload) VALUES (p_request_id, p_payload)
        ON CONFLICT (request_id) DO NOTHING;
    UPDATE public.topup_requests SET payment_prepared_at = coalesce(payment_prepared_at, now())
     WHERE id = p_request_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.prepare_online_payment(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_online_payment(uuid, jsonb) TO service_role;

CREATE FUNCTION public.claim_online_payment(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payload jsonb;
BEGIN
    PERFORM 1 FROM public.topup_requests WHERE id = p_request_id AND status = 'pending'
        AND provider_payment_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE public.online_payment_attempts SET lease_until = now() + interval '30 seconds'
     WHERE request_id = p_request_id AND (lease_until IS NULL OR lease_until < now())
     RETURNING payload INTO v_payload;
    RETURN v_payload;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_online_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_online_payment(uuid) TO service_role;

CREATE FUNCTION public.release_online_payment(p_request_id uuid, p_definitive_failure boolean DEFAULT false)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    PERFORM 1 FROM public.topup_requests WHERE id = p_request_id FOR UPDATE;
    IF p_definitive_failure THEN
        UPDATE public.topup_requests SET status = 'withdrawn', decided_at = now()
         WHERE id = p_request_id AND status = 'pending' AND provider_payment_id IS NULL;
        DELETE FROM public.online_payment_attempts WHERE request_id = p_request_id;
    ELSE
        UPDATE public.online_payment_attempts SET lease_until = NULL WHERE request_id = p_request_id;
    END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.release_online_payment(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_online_payment(uuid, boolean) TO service_role;

CREATE FUNCTION public.apply_mercado_pago_status(
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
    v_updated_at timestamptz := coalesce(p_provider_updated_at, statement_timestamp());
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
    IF v_request.provider_updated_at IS NOT NULL AND v_updated_at < v_request.provider_updated_at THEN
        RETURN v_request.status;
    END IF;
    -- Missing or equal timestamps must never erase a refund/chargeback warning.
    IF v_request.provider_status IN ('refunded', 'charged_back')
       AND p_provider_status NOT IN ('refunded', 'charged_back') THEN
        RETURN v_request.status;
    END IF;
    IF v_request.provider_updated_at = v_updated_at
       AND v_request.status = 'confirmed' AND p_provider_status IN ('pending', 'in_process', 'authorized') THEN
        RETURN v_request.status;
    END IF;

    UPDATE public.topup_requests
       SET provider_payment_id = p_provider_payment_id, provider_status = p_provider_status,
           provider_updated_at = v_updated_at
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

