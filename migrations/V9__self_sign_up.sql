-- Self sign-up: a customer creates the login with the Nelcota auth API and then registers the
-- company here, becoming its owner. The admin can still block the organization afterwards.

CREATE FUNCTION public.register_my_organization(
    p_person_name text,
    p_organization_name text,
    p_document text
)
    RETURNS uuid
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
