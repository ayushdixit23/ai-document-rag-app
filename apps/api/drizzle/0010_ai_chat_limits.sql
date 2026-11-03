CREATE TABLE "ai_chat_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_chat_request" ADD CONSTRAINT "ai_chat_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_request_user_time_idx" ON "ai_chat_request" USING btree ("user_id","started_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reserve_ai_chat_request(
  p_user_id text, p_id text, p_per_minute integer, p_per_day integer, p_concurrent integer
)
RETURNS TABLE (request_id text, reason text, retry_after integer)
LANGUAGE plpgsql VOLATILE STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  checked_at timestamptz;
  minute_count bigint;
  day_count bigint;
  active_count bigint;
  minute_start timestamptz;
  day_start timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ai-chat:' || p_user_id));
  checked_at := clock_timestamp();
  DELETE FROM public.ai_chat_request
  WHERE user_id = p_user_id AND started_at <= checked_at - interval '24 hours'
    AND (active_until IS NULL OR active_until <= checked_at);

  -- VOLATILE refreshes the snapshot after waiting on the per-user lock.
  SELECT count(*) FILTER (WHERE started_at > checked_at - interval '1 minute'),
    count(*), count(*) FILTER (WHERE active_until > checked_at),
    min(started_at) FILTER (WHERE started_at > checked_at - interval '1 minute'), min(started_at)
  INTO minute_count, day_count, active_count, minute_start, day_start
  FROM public.ai_chat_request WHERE user_id = p_user_id;

  IF day_count >= p_per_day THEN
    RETURN QUERY SELECT NULL::text, 'day'::text,
      greatest(1, ceil(extract(epoch FROM day_start + interval '24 hours' - checked_at))::integer);
  ELSIF minute_count >= p_per_minute THEN
    RETURN QUERY SELECT NULL::text, 'minute'::text,
      greatest(1, ceil(extract(epoch FROM minute_start + interval '1 minute' - checked_at))::integer);
  ELSIF active_count >= p_concurrent THEN
    RETURN QUERY SELECT NULL::text, 'concurrent'::text, 1;
  ELSE
    -- A turn has a five-minute stream timeout; the extra minute covers preparation.
    -- Crashed API instances cannot retain a concurrency slot indefinitely.
    INSERT INTO public.ai_chat_request (id, user_id, started_at, active_until)
    VALUES (p_id, p_user_id, checked_at, checked_at + interval '6 minutes');
    RETURN QUERY SELECT p_id, NULL::text, 0;
  END IF;
END;
$$;
