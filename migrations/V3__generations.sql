-- Image generations and the private storage bucket that holds them.

CREATE TYPE public.generation_status AS ENUM ('pending', 'processing', 'done', 'failed');

CREATE TABLE public.generations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
    -- Audit only: no foreign key, so deleting a user keeps the organization's history.
    user_id uuid NOT NULL,
    prompt text NOT NULL CHECK (btrim(prompt) <> '' AND length(prompt) <= 4000),
    model text NOT NULL,
    size text NOT NULL,
    quality public.image_quality NOT NULL,
    -- Price and cost are copied from pricing at reservation time, so later price changes never
    -- rewrite history. openai_cost_usd is an estimate; usd_brl_rate converts it for margins.
    price_cents bigint NOT NULL CHECK (price_cents > 0),
    openai_cost_usd numeric(12, 6) NOT NULL CHECK (openai_cost_usd >= 0),
    usd_brl_rate numeric(10, 4) NOT NULL CHECK (usd_brl_rate > 0),
    storage_path text,
    thumb_path text,
    status public.generation_status NOT NULL DEFAULT 'pending',
    error text CHECK (length(error) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CONSTRAINT generations_done_has_files CHECK (
        status <> 'done'
        OR (storage_path IS NOT NULL AND thumb_path IS NOT NULL AND finished_at IS NOT NULL)
    )
);
CREATE INDEX generations_organization_created_idx
    ON public.generations (organization_id, created_at DESC);
-- Used by the stuck-generation job (phase 6).
CREATE INDEX generations_unfinished_idx ON public.generations (status, created_at)
    WHERE status IN ('pending', 'processing');

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- Rows are created only by reserve_generation (V4); the worker updates progress fields.
GRANT SELECT ON public.generations TO authenticated;
GRANT SELECT, UPDATE (status, storage_path, thumb_path, error, finished_at)
    ON public.generations TO service_role;
CREATE POLICY generations_select ON public.generations FOR SELECT TO authenticated
    USING (organization_id = public.current_organization_id() OR public.is_platform_admin());

-- Private bucket, 20 MiB per file. Paths: {organization_id}/{generation_id}.png and
-- {organization_id}/{generation_id}_thumb.webp. Only service_role uploads.
INSERT INTO storage.buckets (id, public, file_size_limit, allowed_mime_types)
VALUES ('generations', false, 20971520, '{image/png,image/webp,image/jpeg}');

CREATE POLICY generations_bucket_select ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'generations'
        AND (
            (storage.foldername(name))[1] = public.current_organization_id()::text
            OR public.is_platform_admin()
        )
    );
