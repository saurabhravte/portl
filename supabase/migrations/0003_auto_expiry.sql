-- 0003: auto-expire pending visitor requests after 2 minutes.
-- The status trigger (0001) already allows pending -> expired.

create extension if not exists pg_cron;

create or replace function expire_stale_requests() returns integer
language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update visitor_requests
     set status = 'expired', decided_at = now()
   where status = 'pending'
     and created_at < now() - interval '2 minutes';
  get diagnostics affected = row_count;
  return affected;
end $$;

-- Run every 30 seconds (two staggered per-minute jobs, since pg_cron
-- granularity is 1 minute on some plans; '30 seconds' syntax works on
-- pg_cron >= 1.5 / Supabase default).
select cron.schedule(
  'expire-visitor-requests',
  '30 seconds',
  $$select expire_stale_requests()$$
);
