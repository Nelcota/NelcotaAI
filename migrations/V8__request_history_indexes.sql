-- The admin request history lists every organization's requests, newest first, optionally
-- filtered by status (see requestHistoryQuery). The V6 indexes only cover one organization or
-- pending requests.
CREATE INDEX topup_requests_created_idx ON public.topup_requests (created_at DESC);
CREATE INDEX topup_requests_status_created_idx ON public.topup_requests (status, created_at DESC);
