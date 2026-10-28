-- Enforce check digits for every write path, including direct administrator API calls.
CREATE FUNCTION internal.is_valid_tax_document(p_document text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
    v_length integer := length(p_document);
    v_position integer;
    v_check integer;
    v_sum integer;
    v_weight integer;
    v_expected integer;
BEGIN
    IF p_document IS NULL OR p_document !~ '^([0-9]{11}|[0-9]{14})$'
       OR p_document = repeat(substr(p_document, 1, 1), v_length) THEN
        RETURN false;
    END IF;
    FOR v_check IN (v_length - 1)..v_length LOOP
        v_sum := 0;
        FOR v_position IN 1..(v_check - 1) LOOP
            IF v_length = 11 THEN
                v_weight := v_check + 1 - v_position;
            ELSE
                v_weight := 2 + ((v_check - 1 - v_position) % 8);
            END IF;
            v_sum := v_sum + substr(p_document, v_position, 1)::integer * v_weight;
        END LOOP;
        v_expected := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - v_sum % 11 END;
        IF substr(p_document, v_check, 1)::integer <> v_expected THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
END $$;

CREATE FUNCTION internal.validate_organization_document() RETURNS trigger
    LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF internal.is_valid_tax_document(NEW.document) = false THEN
        RAISE EXCEPTION 'organization document has invalid check digits' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END $$;
-- Existing historical records can still be read or blocked; document changes must be valid.
CREATE TRIGGER organizations_validate_document BEFORE INSERT OR UPDATE OF document
    ON public.organizations FOR EACH ROW EXECUTE FUNCTION internal.validate_organization_document();
