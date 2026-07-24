-- 0025: visitor auto-expiry window becomes per-society configuration.
--
-- Previously the 2-minute window was hardcoded twice — in
-- expire_stale_requests() (interval '2 minutes') and in the client's
-- Countdown component (EXPIRY_MS = 2 * 60 * 1000). Two copies of one
-- business rule drift. The single source of truth is now
-- societies.settings->>'visitorExpiryMinutes' (default 2, clamped 1–10);
-- both the cron job and the client read it.

create or replace function visitor_expiry_minutes(p_society uuid)
returns integer
language sql stable
set search_path = public
as $$
  select least(10, greatest(1,
    coalesce(nullif(s.settings->>'visitorExpiryMinutes', '')::integer, 2)))
  from societies s
  where s.id = p_society
$$;

comment on function visitor_expiry_minutes(uuid) is
  'Minutes before a pending visitor request auto-expires. Reads societies.settings.visitorExpiryMinutes, default 2, clamped to 1–10.';

create or replace function expire_stale_requests() returns integer
language plpgsql security definer
set search_path = public
as $$
declare affected integer;
begin
  update visitor_requests vr
     set status = 'expired', decided_at = now()
    from visitors v
   where v.id = vr.visitor_id
     and vr.status = 'pending'
     and vr.created_at
         < now() - make_interval(mins => visitor_expiry_minutes(v.society_id));
  get diagnostics affected = row_count;
  return affected;
end $$;
