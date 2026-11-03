-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION public.reserve_rerank_call(p_scope text, p_id text)
RETURNS text
LANGUAGE plpgsql VOLATILE STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  monthly_requests bigint;
  minute_requests bigint;
  blocked boolean;
  checked_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('rerank:' || p_scope));
  checked_at := clock_timestamp();
  DELETE FROM public.rerank_usage
  WHERE scope = p_scope AND dispatched_at < checked_at - interval '31 days'
    AND (blocked_until IS NULL OR blocked_until <= checked_at);

  -- VOLATILE obtains a fresh snapshot after waiting for the scope lock.
  SELECT count(*) FILTER (WHERE dispatched_at >= checked_at - interval '31 days'),
    count(*) FILTER (WHERE dispatched_at >= checked_at - interval '1 minute'),
    coalesce(bool_or(blocked_until > checked_at), false)
  INTO monthly_requests, minute_requests, blocked
  FROM public.rerank_usage WHERE scope = p_scope;

  IF monthly_requests >= 500 OR minute_requests >= 60 OR blocked THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.rerank_usage (id, scope, dispatched_at)
  VALUES (p_id, p_scope, checked_at);
  RETURN p_id;
END;
$$;
