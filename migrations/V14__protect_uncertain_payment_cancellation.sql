-- A cancelled unknown write must not free the customer to unknowingly submit a second charge.
CREATE OR REPLACE FUNCTION public.cancel_my_topup(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_organization_id uuid := public.current_organization_id();
    v_request public.topup_requests%ROWTYPE;
BEGIN
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'caller has no organization' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_request FROM public.topup_requests
     WHERE id = p_request_id AND organization_id = v_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'only pending requests can be withdrawn' USING ERRCODE = 'P0014';
    END IF;
    IF v_request.payment_prepared_at IS NOT NULL AND v_request.provider_payment_id IS NULL THEN
        RAISE EXCEPTION 'payment creation must be reconciled before withdrawal' USING ERRCODE = 'P0020';
    END IF;
    UPDATE public.topup_requests SET status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
     WHERE id = p_request_id;
END $$;
