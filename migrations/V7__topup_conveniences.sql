-- Conveniences for the manual top-up flow: the customer can withdraw a pending request and
-- attach the Pix receipt; the admin records the payment reference when confirming; settings
-- gain the merchant city that the Pix "copia e cola" code (BR Code) requires.
--
-- New error codes (see V4 and V6 for the others):
--   P0017  payment reference already used on another request

-- A request the customer gave up on. Distinct from 'cancelled', which the admin decides.
-- The new value is only referenced inside function bodies, which run after this commits.
ALTER TYPE public.topup_request_status ADD VALUE 'withdrawn';

-- Settings ---------------------------------------------------------------------------------
-- BR Code field 60 (merchant city): up to 15 characters.
ALTER TABLE public.settings
    ADD COLUMN pix_city text CHECK (btrim(pix_city) <> '' AND length(pix_city) <= 15);
GRANT UPDATE (pix_city) ON public.settings TO authenticated;

-- Requests ---------------------------------------------------------------------------------
ALTER TABLE public.topup_requests
    ADD COLUMN payment_reference text
        CHECK (btrim(payment_reference) <> '' AND length(payment_reference) <= 120),
    ADD COLUMN receipt_path text CHECK (length(receipt_path) <= 300);
-- One payment can only confirm one request.
CREATE UNIQUE INDEX topup_requests_payment_reference_idx
    ON public.topup_requests (payment_reference)
    WHERE payment_reference IS NOT NULL;

-- Receipts bucket: private, 5 MiB, images or PDF. Paths: {organization_id}/{request_id}/{file}.
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

-- The Pix code needs key, receiver and city, so requests wait for all three.
CREATE OR REPLACE FUNCTION public.request_topup(p_amount_cents bigint) RETURNS uuid
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

-- The customer withdraws their own pending request (for example, they decided not to pay).
CREATE FUNCTION public.cancel_my_topup(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_organization_id uuid := public.current_organization_id();
    v_status public.topup_request_status;
BEGIN
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'caller has no organization' USING ERRCODE = '42501';
    END IF;

    SELECT r.status INTO v_status FROM public.topup_requests r
     WHERE r.id = p_request_id AND r.organization_id = v_organization_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'top-up request % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'top-up request % is %, only pending requests can be withdrawn',
            p_request_id, v_status USING ERRCODE = 'P0014';
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

-- Confirmation now records the payment reference (for example, the Mercado Pago transaction id).
DROP FUNCTION public.admin_confirm_topup(uuid);
CREATE FUNCTION public.admin_confirm_topup(p_request_id uuid, p_payment_reference text DEFAULT NULL)
    RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_request public.topup_requests%ROWTYPE;
    v_reference text := nullif(btrim(p_payment_reference), '');
    v_other_request_id uuid;
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
    IF v_request.status = 'confirmed' THEN
        RETURN false;
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'top-up request % is %', p_request_id, v_request.status
            USING ERRCODE = 'P0014';
    END IF;

    IF v_reference IS NOT NULL THEN
        SELECT r.id INTO v_other_request_id FROM public.topup_requests r
         WHERE r.payment_reference = v_reference AND r.id <> p_request_id;
        IF FOUND THEN
            RAISE EXCEPTION 'payment reference % already confirmed request %',
                v_reference, v_other_request_id USING ERRCODE = 'P0017';
        END IF;
    END IF;

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
