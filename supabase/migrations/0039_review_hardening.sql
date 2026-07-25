-- 0039: Review hardening — amenity payment expiry, capacity safety,
-- visitor_requests.flat_id for filtered realtime, honest expiry deep-links.
--
-- Escalation SOP (honest): expire_stale_requests() marks pending → expired,
-- notifies the flat + society admins, and deep-links residents to visitor
-- history. It does NOT auto-route approval to another resident or force an
-- admin decision. Guard retry and admin override remain manual paths.

-- ─────────────────────────────────────────────────────────────────────────
-- # Amenity: expire abandoned pending_payment rows (capacity holders)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function expire_stale_amenity_payments(
  p_ttl_minutes int default 15
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  affected integer := 0;
  r record;
begin
  if p_ttl_minutes is null or p_ttl_minutes < 5 or p_ttl_minutes > 120 then
    p_ttl_minutes := 15;
  end if;

  for r in
    with expired as (
      update amenity_bookings ab
         set status = 'cancelled'
       where ab.status = 'pending_payment'
         and ab.created_at < now() - make_interval(mins => p_ttl_minutes)
         and ab.payment_id is null
      returning ab.id, ab.amenity_id, ab.starts_at, ab.ends_at, ab.booked_by
    )
    select * from expired
  loop
    affected := affected + 1;
    insert into notifications(user_id, type, payload) values (
      r.booked_by, 'amenity_booking',
      jsonb_build_object(
        'title', 'Booking payment expired',
        'body', 'Your amenity slot was released because payment was not completed in time.',
        'url', '/(resident)/amenities',
        'bookingId', r.id
      )
    );
    -- Free capacity for the next waiter on this exact slot.
    perform promote_amenity_waitlist(r.amenity_id, r.starts_at, r.ends_at);
  end loop;

  return affected;
end $$;

revoke all on function expire_stale_amenity_payments(int) from public;

-- Use plain SQL string (not nested $$) — nested dollar-quotes break the DO body.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'expire-amenity-payments') then
      perform cron.unschedule('expire-amenity-payments');
    end if;
    perform cron.schedule(
      'expire-amenity-payments',
      '* * * * *',
      'select public.expire_stale_amenity_payments();'
    );
  end if;
exception when others then
  raise notice 'pg_cron schedule for expire-amenity-payments skipped: %', sqlerrm;
end $cron$;

-- ─────────────────────────────────────────────────────────────────────────
-- # Amenity: load-bearing FOR UPDATE + post-insert capacity recheck
-- Correctness for capacity > 1 depends entirely on locking the amenities
-- row (FOR UPDATE) inside book_amenity / promote_amenity_waitlist before
-- the overlap count. The GiST exclusion from 0004 was dropped in 0017
-- because it only modeled capacity = 1. Do not remove those locks.
-- This trigger is belt-and-suspenders if any insert path forgets the lock.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function amenity_bookings_enforce_capacity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a amenities;
  overlap_count int;
begin
  if not (new.status = any (amenity_capacity_statuses())) then
    return new;
  end if;

  -- Serialize against concurrent bookers of the same amenity.
  select * into a from amenities where id = new.amenity_id for update;
  if not found then
    raise exception 'amenity unavailable' using errcode = 'P0001';
  end if;

  select count(*) into overlap_count
    from amenity_bookings
   where amenity_id = new.amenity_id
     and id is distinct from new.id
     and status = any (amenity_capacity_statuses())
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)');

  if overlap_count >= a.capacity then
    raise exception 'slot is full' using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_amenity_bookings_enforce_capacity on amenity_bookings;
create trigger trg_amenity_bookings_enforce_capacity
  before insert or update of status, starts_at, ends_at, amenity_id
  on amenity_bookings
  for each row execute function amenity_bookings_enforce_capacity();

comment on function book_amenity(uuid, timestamptz, timestamptz) is
  'LOAD-BEARING: SELECT amenities … FOR UPDATE serializes capacity checks. '
  'GiST exclusion was removed in 0017 for capacity > 1. Do not drop the lock.';

comment on function promote_amenity_waitlist(uuid, timestamptz, timestamptz) is
  'LOAD-BEARING: locks amenities FOR UPDATE before capacity recheck + insert.';

-- ─────────────────────────────────────────────────────────────────────────
-- # Realtime scale: denormalize flat_id onto visitor_requests
-- ─────────────────────────────────────────────────────────────────────────
alter table visitor_requests
  add column if not exists flat_id uuid references flats(id);

-- Backfill from visitors.
update visitor_requests vr
   set flat_id = v.flat_id
  from visitors v
 where v.id = vr.visitor_id
   and vr.flat_id is distinct from v.flat_id;

create or replace function visitor_requests_sync_flat_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flat_id is null or tg_op = 'INSERT' then
    select flat_id into new.flat_id from visitors where id = new.visitor_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_visitor_requests_sync_flat_id on visitor_requests;
create trigger trg_visitor_requests_sync_flat_id
  before insert or update of visitor_id
  on visitor_requests
  for each row execute function visitor_requests_sync_flat_id();

-- Keep in sync if a visitor's flat ever changes (rare).
create or replace function visitors_propagate_flat_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flat_id is distinct from old.flat_id then
    update visitor_requests
       set flat_id = new.flat_id
     where visitor_id = new.id
       and flat_id is distinct from new.flat_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_visitors_propagate_flat_id on visitors;
create trigger trg_visitors_propagate_flat_id
  after update of flat_id on visitors
  for each row execute function visitors_propagate_flat_id();

create index if not exists visitor_requests_flat_id_status_idx
  on visitor_requests (flat_id, status)
  where flat_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- # Expiry deep-link: residents → visitor history (not pre-approvals)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function expire_stale_requests() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  affected integer := 0;
  r record;
begin
  -- SOP: expire + notify only. No auto-approve / auto-route to co-resident.
  -- Guard may retry; admin may override manually.
  for r in
    with expired as (
      update visitor_requests vr
         set status = 'expired', decided_at = now()
        from visitors v
       where v.id = vr.visitor_id
         and vr.status = 'pending'
         and vr.created_at
             < now() - make_interval(mins => visitor_expiry_minutes(v.society_id))
      returning vr.id, coalesce(vr.flat_id, v.flat_id) as flat_id, v.society_id, v.name
    )
    select id, flat_id, society_id, name from expired
  loop
    affected := affected + 1;
    perform notify_flat_residents(
      r.flat_id, 'visitor_expired',
      jsonb_build_object(
        'title', 'Visitor request went unanswered',
        'body', coalesce(r.name,'A visitor') || ' at the gate was not approved in time. Guard may retry or admin can override.',
        'url', '/(resident)/history'
      )
    );
    perform notify_society_role(
      r.society_id, 'admin', 'visitor_expired',
      jsonb_build_object(
        'title', 'Unanswered visitor request',
        'body', coalesce(r.name,'A visitor') || ' expired — use admin override if the visitor is still waiting.',
        'url', '/(admin)/history'
      )
    );
  end loop;

  return affected;
end $$;

revoke all on function expire_stale_requests() from public;

comment on function expire_stale_requests() is
  'Expires unanswered pending requests and notifies flat + admins. '
  'Not true auto-escalation: does not reassign approval or force admin decision.';
