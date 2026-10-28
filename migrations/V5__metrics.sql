-- Metrics exposed as RPC. Both run as the caller (SECURITY INVOKER), so RLS decides which
-- rows they aggregate.

-- Generations and spend per day (Sao Paulo calendar) for the caller's organization.
-- Failed generations are excluded because they were refunded.
CREATE FUNCTION public.get_dashboard_metrics(p_from date, p_to date)
    RETURNS TABLE (day date, generations_count bigint, spend_cents bigint)
    LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
    c_max_days constant integer := 366;
    v_organization_id uuid := public.current_organization_id();
    v_start timestamptz;
    v_end timestamptz;
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
        RAISE EXCEPTION 'invalid period: % to %', p_from, p_to USING ERRCODE = '22023';
    END IF;
    IF p_to - p_from >= c_max_days THEN
        RAISE EXCEPTION 'period must have at most % days, got %', c_max_days, p_to - p_from + 1
            USING ERRCODE = '22023';
    END IF;
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'caller has no organization' USING ERRCODE = 'P0002';
    END IF;

    v_start := p_from::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_end := (p_to + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

    RETURN QUERY
    WITH daily_generations AS (
        SELECT (g.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, count(*) AS total
          FROM public.generations g
         WHERE g.organization_id = v_organization_id
           AND g.status <> 'failed'
           AND g.created_at >= v_start AND g.created_at < v_end
         GROUP BY 1
    ),
    daily_spend AS (
        SELECT (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, -sum(t.amount_cents) AS total
          FROM public.wallet_transactions t
         WHERE t.organization_id = v_organization_id
           AND t.type IN ('usage', 'refund')
           AND t.created_at >= v_start AND t.created_at < v_end
         GROUP BY 1
    )
    SELECT d.day::date,
           coalesce(dg.total, 0)::bigint,
           coalesce(ds.total, 0)::bigint
      FROM generate_series(p_from, p_to, interval '1 day') AS d (day)
      LEFT JOIN daily_generations dg ON dg.day = d.day::date
      LEFT JOIN daily_spend ds ON ds.day = d.day::date
     ORDER BY 1;
END
$$;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(date, date) TO authenticated;

-- Platform totals for one month (Sao Paulo calendar). Only for platform admins.
-- charged = net usage (debits minus refunds); OpenAI cost converted with the rate snapshotted
-- on each generation; margin = charged minus that cost.
CREATE FUNCTION public.admin_overview(p_month date)
    RETURNS TABLE (
        topped_up_cents bigint,
        charged_cents bigint,
        generations_count bigint,
        openai_cost_usd numeric,
        openai_cost_cents bigint,
        margin_cents bigint
    )
    LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
    v_start timestamptz;
    v_end timestamptz;
    v_topped_up_cents bigint;
    v_charged_cents bigint;
    v_generations_count bigint;
    v_cost_usd numeric;
    v_cost_cents bigint;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'only platform admins can see the overview' USING ERRCODE = '42501';
    END IF;
    IF p_month IS NULL THEN
        RAISE EXCEPTION 'month is required' USING ERRCODE = '22023';
    END IF;

    v_start := date_trunc('month', p_month)::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_end := (date_trunc('month', p_month) + interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo';

    SELECT coalesce(sum(t.amount_cents) FILTER (WHERE t.type = 'topup'), 0),
           coalesce(-sum(t.amount_cents) FILTER (WHERE t.type IN ('usage', 'refund')), 0)
      INTO v_topped_up_cents, v_charged_cents
      FROM public.wallet_transactions t
     WHERE t.created_at >= v_start AND t.created_at < v_end;

    SELECT count(*),
           coalesce(sum(g.openai_cost_usd), 0),
           coalesce(round(sum(g.openai_cost_usd * g.usd_brl_rate) * 100), 0)
      INTO v_generations_count, v_cost_usd, v_cost_cents
      FROM public.generations g
     WHERE g.status = 'done'
       AND g.created_at >= v_start AND g.created_at < v_end;

    RETURN QUERY SELECT v_topped_up_cents, v_charged_cents, v_generations_count,
                        v_cost_usd, v_cost_cents, v_charged_cents - v_cost_cents;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_overview(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_overview(date) TO authenticated;
