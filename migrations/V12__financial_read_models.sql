-- Stable cursors retain every row when multiple events share a timestamp.
CREATE INDEX topup_requests_organization_cursor_idx
    ON public.topup_requests(organization_id, created_at DESC, id DESC);
CREATE INDEX topup_requests_cursor_idx ON public.topup_requests(created_at DESC, id DESC);
CREATE INDEX topup_requests_status_cursor_idx ON public.topup_requests(status, created_at DESC, id DESC);
CREATE INDEX wallet_transactions_cursor_idx
    ON public.wallet_transactions(organization_id, created_at DESC, id DESC);
CREATE INDEX wallet_transactions_credit_idx
    ON public.wallet_transactions(organization_id, created_at DESC, id DESC) WHERE type = 'topup';

CREATE VIEW public.organization_summaries WITH (security_invoker = true) AS
SELECT o.id, o.name, o.document, o.status, o.created_at, b.balance_cents, b.month_topup_cents
FROM public.organizations o JOIN public.organization_balances b ON b.organization_id = o.id;
GRANT SELECT ON public.organization_summaries TO authenticated;

CREATE FUNCTION public.get_organization_topup_summary(p_organization_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT jsonb_build_object(
        'balance_cents', b.balance_cents,
        'month_topup_cents', b.month_topup_cents,
        'credited_count', (SELECT count(*) FROM public.wallet_transactions t
                           WHERE t.organization_id = b.organization_id AND t.type = 'topup'),
        'last_credit_cents', last_credit.amount_cents,
        'last_credit_at', last_credit.created_at
    )
    FROM public.organization_balances b
    LEFT JOIN LATERAL (
        SELECT t.amount_cents, t.created_at FROM public.wallet_transactions t
         WHERE t.organization_id = b.organization_id AND t.type = 'topup'
         ORDER BY t.created_at DESC, t.id DESC LIMIT 1
    ) last_credit ON true
    WHERE b.organization_id = p_organization_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_organization_topup_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_topup_summary(uuid) TO authenticated;

CREATE FUNCTION public.get_topup_month_totals(p_organization_id uuid, p_months date[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', month, 'topup_cents', topup_cents) ORDER BY month), '[]'::jsonb)
    FROM (
        SELECT date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS month,
               sum(t.amount_cents)::bigint AS topup_cents
          FROM public.wallet_transactions t
         WHERE t.organization_id = p_organization_id AND t.type = 'topup'
           AND date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = ANY(p_months)
         GROUP BY 1
    ) totals;
$$;
REVOKE EXECUTE ON FUNCTION public.get_topup_month_totals(uuid, date[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topup_month_totals(uuid, date[]) TO authenticated;

CREATE FUNCTION public.get_platform_topup_summary() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'platform administrator required' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'organization_count', (SELECT count(*) FROM public.organizations),
        'active_organization_count', (SELECT count(*) FROM public.organizations WHERE status = 'active'),
        'month_topup_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.wallet_transactions
                            WHERE type = 'topup' AND created_at >= internal.current_month_start()),
        'pending_count', (SELECT count(*) FROM public.topup_requests
                         WHERE status = 'pending' AND payment_method = 'manual_pix'),
        'pending_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.topup_requests
                         WHERE status = 'pending' AND payment_method = 'manual_pix')
    );
END $$;
REVOKE EXECUTE ON FUNCTION public.get_platform_topup_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_topup_summary() TO authenticated;
