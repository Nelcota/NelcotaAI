-- Core tables: organizations, profiles, settings and pricing.
--
-- Authorization lives only in GRANTs and RLS. New tables in Nelcota have no default
-- privileges, so every GRANT below is explicit and minimal. service_role bypasses RLS,
-- therefore its column-level GRANTs are the only thing limiting what the app server can write.

-- Internal helpers live outside the exposed schema (NELCOTA_DB_SCHEMA=public), so they never
-- become RPC endpoints.
CREATE SCHEMA internal;
GRANT USAGE ON SCHEMA internal TO authenticated, service_role;

-- Start of the current billing month. Months follow the customers' wall clock (Sao Paulo),
-- while every timestamp is stored in UTC.
CREATE FUNCTION internal.current_month_start() RETURNS timestamptz
    LANGUAGE sql STABLE SET search_path = ''
AS $$
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
$$;
REVOKE EXECUTE ON FUNCTION internal.current_month_start() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.current_month_start() TO authenticated, service_role;

CREATE TYPE public.organization_status AS ENUM ('active', 'blocked');
CREATE TYPE public.member_role AS ENUM ('owner', 'member');
CREATE TYPE public.image_quality AS ENUM ('low', 'medium', 'high');

CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
    -- CPF (11 digits) or CNPJ (14 digits), digits only. Required by Asaas to create the customer.
    document text NOT NULL UNIQUE CHECK (document ~ '^([0-9]{11}|[0-9]{14})$'),
    asaas_customer_id text UNIQUE CHECK (btrim(asaas_customer_id) <> ''),
    status public.organization_status NOT NULL DEFAULT 'active',
    monthly_spend_limit_cents bigint CHECK (monthly_spend_limit_cents > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations (id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
    role public.member_role NOT NULL DEFAULT 'member',
    is_platform_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Only the platform admin may exist without an organization.
    CONSTRAINT profiles_organization_required CHECK (organization_id IS NOT NULL OR is_platform_admin)
);
CREATE INDEX profiles_organization_id_idx ON public.profiles (organization_id);

-- Single-row table: the boolean primary key can only ever be true.
CREATE TABLE public.settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    default_model text NOT NULL CHECK (btrim(default_model) <> '' AND length(default_model) <= 100),
    generations_per_minute_limit integer NOT NULL
        CHECK (generations_per_minute_limit BETWEEN 1 AND 1000),
    low_balance_threshold_cents bigint NOT NULL CHECK (low_balance_threshold_cents >= 0)
);

INSERT INTO public.settings (default_model, generations_per_minute_limit, low_balance_threshold_cents)
VALUES ('gpt-image-1', 10, 1000);

CREATE TABLE public.pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model text NOT NULL CHECK (btrim(model) <> '' AND length(model) <= 100),
    size text NOT NULL CHECK (size ~ '^[0-9]{3,4}x[0-9]{3,4}$'),
    quality public.image_quality NOT NULL,
    price_cents bigint NOT NULL CHECK (price_cents > 0),
    openai_cost_usd numeric(12, 6) NOT NULL CHECK (openai_cost_usd >= 0),
    usd_brl_rate numeric(10, 4) NOT NULL CHECK (usd_brl_rate > 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Old rows stay for history; only one active price per combination.
CREATE UNIQUE INDEX pricing_active_combination_idx ON public.pricing (model, size, quality)
    WHERE active;

-- SECURITY DEFINER so RLS policies on profiles can call these without recursing into
-- the profiles policies themselves.
CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT coalesce(
        (SELECT p.is_platform_admin FROM public.profiles p WHERE p.user_id = auth.uid()),
        false
    )
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

CREATE FUNCTION public.current_organization_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;

-- organizations: members read their own, the platform admin reads and manages all.
GRANT SELECT ON public.organizations TO authenticated;
GRANT INSERT (name, document, monthly_spend_limit_cents) ON public.organizations TO authenticated;
GRANT UPDATE (name, document, status, monthly_spend_limit_cents) ON public.organizations TO authenticated;
GRANT SELECT, UPDATE (asaas_customer_id) ON public.organizations TO service_role;

CREATE POLICY organizations_select ON public.organizations FOR SELECT TO authenticated
    USING (id = public.current_organization_id() OR public.is_platform_admin());
CREATE POLICY organizations_admin_insert ON public.organizations FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin());
CREATE POLICY organizations_admin_update ON public.organizations FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- profiles: read-only through the API. Nobody can promote themselves to admin; profiles are
-- created by the admin linking flow (phase 5) or by SQL.
GRANT SELECT ON public.profiles TO authenticated, service_role;

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR organization_id = public.current_organization_id()
        OR public.is_platform_admin()
    );

-- settings and pricing: every signed-in user reads them (the UI shows prices before
-- generating); only the platform admin edits.
GRANT SELECT ON public.settings, public.pricing TO authenticated, service_role;
GRANT UPDATE (default_model, generations_per_minute_limit, low_balance_threshold_cents)
    ON public.settings TO authenticated;
GRANT INSERT (model, size, quality, price_cents, openai_cost_usd, usd_brl_rate, active),
      UPDATE (price_cents, openai_cost_usd, usd_brl_rate, active)
    ON public.pricing TO authenticated;

CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin_update ON public.settings FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

CREATE POLICY pricing_select ON public.pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY pricing_admin_insert ON public.pricing FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin());
CREATE POLICY pricing_admin_update ON public.pricing FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
