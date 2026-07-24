-- 0030_amenity_booking_extensions.sql
-- Amenity backlog: recurring (#44), waitlist (#45), QR access (#46),
-- no-show/cancel penalties (#47), paid checkout (#48), usage analytics (#49).

-- ─────────────────────────────────────────────────────────────────────────
-- Schema extensions
-- ─────────────────────────────────────────────────────────────────────────
alter table amenities
  add column if not exists late_cancel_penalty numeric(10,2) not null default 0
    check (late_cancel_penalty >= 0),
  add column if not exists no_show_penalty numeric(10,2) not null default 0
    check (no_show_penalty >= 0),
  add column if not exists checkin_grace_minutes int not null default 15
    check (checkin_grace_minutes between 0 and 180);

alter table amenity_bookings
  add column if not exists access_code text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists series_id uuid,
  add column if not exists payment_id text,
  add column if not exists payment_order_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_amount numeric(10,2);

alter table amenity_bookings drop constraint if exists amenity_bookings_status_check;
alter table amenity_bookings add constraint amenity_bookings_status_check
  check (status in (
    'pending_payment', 'pending', 'confirmed', 'waitlisted',
    'cancelled', 'rejected', 'no_show'
  ));

create unique index if not exists amenity_bookings_access_code_uidx
  on amenity_bookings (access_code)
  where access_code is not null;

-- Recurring series (#44)
create table if not exists amenity_recurring_series (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  amenity_id uuid not null references amenities(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  booked_by text not null references profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1439),
  slot_minutes int not null check (slot_minutes between 5 and 1440),
  weeks int not null check (weeks between 2 and 12),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table amenity_bookings
  drop constraint if exists amenity_bookings_series_id_fkey;
alter table amenity_bookings
  add constraint amenity_bookings_series_id_fkey
  foreign key (series_id) references amenity_recurring_series(id) on delete set null;

alter table amenity_recurring_series enable row level security;
create policy amenity_series_read on amenity_recurring_series for select using (
  society_id = my_society()
  and (my_role() = 'admin' or booked_by = clerk_uid() or flat_id = my_flat())
);

-- Waitlist (#45)
create table if not exists amenity_waitlist (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  amenity_id uuid not null references amenities(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  requested_by text not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'promoted', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  promoted_booking_id uuid references amenity_bookings(id) on delete set null,
  check (ends_at > starts_at),
  unique (amenity_id, flat_id, starts_at, ends_at)
);
create index if not exists amenity_waitlist_slot_idx
  on amenity_waitlist (amenity_id, starts_at, ends_at, status, created_at);
alter table amenity_waitlist enable row level security;
create policy amenity_waitlist_read on amenity_waitlist for select using (
  society_id = my_society()
  and (my_role() = 'admin' or requested_by = clerk_uid() or flat_id = my_flat())
);

-- Penalties (#47)
create table if not exists amenity_penalties (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  booking_id uuid references amenity_bookings(id) on delete set null,
  kind text not null check (kind in ('late_cancel', 'no_show')),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'due' check (status in ('due', 'waived', 'paid')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists amenity_penalties_flat_idx
  on amenity_penalties (flat_id, status, created_at desc);
alter table amenity_penalties enable row level security;
create policy amenity_penalties_read on amenity_penalties for select using (
  society_id = my_society()
  and (my_role() = 'admin' or flat_id = my_flat())
);
create policy amenity_penalties_admin on amenity_penalties for all
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────
create or replace function amenity_generate_access_code()
returns text
language plpgsql
as $$
declare
  code text;
  attempts int := 0;
begin
  loop
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from amenity_bookings where access_code = code
    );
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'could not allocate amenity access code';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function amenity_capacity_statuses()
returns text[]
language sql immutable as $$
  select array['pending_payment', 'pending', 'confirmed'];
$$;

create or replace function amenity_issue_access_if_confirmed(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update amenity_bookings
     set access_code = coalesce(access_code, amenity_generate_access_code())
   where id = p_booking_id
     and status = 'confirmed'
     and access_code is null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Lifecycle (expanded transitions)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function enforce_amenity_booking_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
  amenity_society uuid;
  booking_society uuid;
begin
  select role into caller_role from profiles where id = clerk_uid();
  select society_id into amenity_society from amenities where id = new.amenity_id;
  select society_id into booking_society from flats where id = new.flat_id;
  if amenity_society is null
     or booking_society is distinct from amenity_society
     or not exists (
       select 1 from profiles p
       where p.id = new.booked_by
         and p.role = 'resident'
         and p.flat_id = new.flat_id
         and p.society_id = amenity_society
     ) then
    raise exception 'booking participants must belong to the amenity society'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.amenity_id is distinct from old.amenity_id
     or new.flat_id is distinct from old.flat_id
     or new.booked_by is distinct from old.booked_by
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.created_at is distinct from old.created_at
     or new.series_id is distinct from old.series_id then
    raise exception 'booking identity and slot are immutable'
      using errcode = '42501';
  end if;

  -- Allow access_code / checked_in_at / payment fields to change without status change.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if caller_role = 'resident' then
    if new.booked_by is distinct from clerk_uid() then
      raise exception 'residents may only change their own booking' using errcode = '42501';
    end if;
    if not (
      (old.status in ('pending', 'confirmed', 'pending_payment', 'waitlisted')
        and new.status = 'cancelled')
    ) then
      raise exception 'residents may only cancel an active booking' using errcode = '42501';
    end if;
  elsif caller_role = 'admin' then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
      or (old.status = 'pending_payment' and new.status in ('confirmed', 'pending', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('cancelled', 'no_show'))
      or (old.status = 'waitlisted' and new.status in ('cancelled', 'confirmed', 'pending', 'pending_payment'))
    ) then
      raise exception 'invalid administrative booking transition' using errcode = '23514';
    end if;
  elsif caller_role is null then
    -- Service-role / definer payment + no-show workers.
    if not (
      (old.status = 'pending_payment' and new.status in ('pending', 'confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status = 'no_show')
      or (old.status = 'waitlisted' and new.status in ('pending', 'confirmed', 'pending_payment', 'cancelled'))
    ) then
      raise exception 'invalid system booking transition' using errcode = '23514';
    end if;
  else
    raise exception 'booking updates require a resident or administrator'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- #48 / #43 book_amenity (paid → pending_payment; free → pending/confirmed)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function book_amenity(
  p_amenity_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a amenities;
  booking_id uuid;
  overlap_count int;
  initial_status text;
begin
  if my_role() <> 'resident' or my_flat() is null then
    raise exception 'residents only' using errcode = '42501';
  end if;
  select * into a from amenities
   where id = p_amenity_id and society_id = my_society() and is_active
   for update;
  if not found then raise exception 'amenity unavailable' using errcode = 'P0001'; end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'invalid booking time' using errcode = '22023';
  end if;
  if p_starts_at::date = any (a.blackout_dates) then
    raise exception 'amenity is blacked out on this date' using errcode = '23514';
  end if;
  if p_starts_at::time < a.open_time or p_ends_at::time > a.close_time
     or extract(epoch from (p_ends_at - p_starts_at)) / 60 <> a.slot_minutes then
    raise exception 'booking must match an available slot' using errcode = '22023';
  end if;

  select count(*) into overlap_count from amenity_bookings
   where amenity_id = a.id
     and status = any (amenity_capacity_statuses())
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
  if overlap_count >= a.capacity then
    raise exception 'slot is full' using errcode = '23514';
  end if;

  if a.price > 0 then
    initial_status := 'pending_payment';
  elsif a.requires_approval then
    initial_status := 'pending';
  else
    initial_status := 'confirmed';
  end if;

  insert into amenity_bookings (
    amenity_id, flat_id, booked_by, starts_at, ends_at, status, payment_amount,
    access_code
  ) values (
    a.id, my_flat(), clerk_uid(), p_starts_at, p_ends_at, initial_status,
    case when a.price > 0 then a.price else null end,
    case when initial_status = 'confirmed' then amenity_generate_access_code() else null end
  ) returning id into booking_id;

  return booking_id;
end $$;

revoke all on function book_amenity(uuid, timestamptz, timestamptz) from public;
grant execute on function book_amenity(uuid, timestamptz, timestamptz) to authenticated;

-- Confirm payment after Razorpay verify (#48)
create or replace function confirm_amenity_booking_payment(
  p_booking_id uuid,
  p_payment_id text,
  p_order_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b record;
  next_status text;
begin
  if p_payment_id is null or length(btrim(p_payment_id)) < 5
     or p_order_id is null or length(btrim(p_order_id)) < 5 then
    raise exception 'payment references required' using errcode = '22023';
  end if;

  select ab.*, a.requires_approval, a.price, a.society_id
    into b
  from amenity_bookings ab
  join amenities a on a.id = ab.amenity_id
  where ab.id = p_booking_id
  for update of ab;
  if not found then raise exception 'booking not found' using errcode = 'P0001'; end if;

  -- Caller JWT path: must own the booking. Service-role path: clerk_uid() is null.
  if clerk_uid() is not null and b.booked_by is distinct from clerk_uid() then
    raise exception 'only the booker can confirm payment' using errcode = '42501';
  end if;
  if b.status <> 'pending_payment' then
    if b.payment_id is not null then
      return jsonb_build_object('id', b.id, 'status', b.status, 'alreadyPaid', true);
    end if;
    raise exception 'booking is not awaiting payment' using errcode = '23514';
  end if;

  next_status := case when b.requires_approval then 'pending' else 'confirmed' end;

  update amenity_bookings
     set status = next_status,
         payment_id = btrim(p_payment_id),
         payment_order_id = btrim(p_order_id),
         paid_at = now(),
         access_code = case
           when next_status = 'confirmed' then coalesce(access_code, amenity_generate_access_code())
           else access_code
         end
   where id = p_booking_id;

  return jsonb_build_object('id', p_booking_id, 'status', next_status);
end $$;
revoke all on function confirm_amenity_booking_payment(uuid, text, text) from public;
grant execute on function confirm_amenity_booking_payment(uuid, text, text) to authenticated;
grant execute on function confirm_amenity_booking_payment(uuid, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- #45 Waitlist + auto-promotion
-- ─────────────────────────────────────────────────────────────────────────
create or replace function promote_amenity_waitlist(
  p_amenity_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a amenities;
  w amenity_waitlist;
  overlap_count int;
  booking_id uuid;
  initial_status text;
begin
  select * into a from amenities where id = p_amenity_id for update;
  if not found then return null; end if;

  select count(*) into overlap_count from amenity_bookings
   where amenity_id = a.id
     and status = any (amenity_capacity_statuses())
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
  if overlap_count >= a.capacity then return null; end if;

  select * into w from amenity_waitlist
   where amenity_id = p_amenity_id
     and starts_at = p_starts_at
     and ends_at = p_ends_at
     and status = 'waiting'
   order by created_at
   for update skip locked
   limit 1;
  if not found then return null; end if;

  if a.price > 0 then
    initial_status := 'pending_payment';
  elsif a.requires_approval then
    initial_status := 'pending';
  else
    initial_status := 'confirmed';
  end if;

  insert into amenity_bookings (
    amenity_id, flat_id, booked_by, starts_at, ends_at, status, payment_amount, access_code
  ) values (
    a.id, w.flat_id, w.requested_by, p_starts_at, p_ends_at, initial_status,
    case when a.price > 0 then a.price else null end,
    case when initial_status = 'confirmed' then amenity_generate_access_code() else null end
  ) returning id into booking_id;

  update amenity_waitlist
     set status = 'promoted', promoted_booking_id = booking_id
   where id = w.id;

  insert into notifications(user_id, type, payload) values (
    w.requested_by, 'amenity_booking',
    jsonb_build_object(
      'title', 'Waitlist promoted',
      'body', a.name || ' slot is now yours'
        || case when initial_status = 'pending_payment' then ' — complete payment to confirm.' else '.' end,
      'url', '/(resident)/amenities',
      'bookingId', booking_id
    )
  );

  return booking_id;
end $$;
revoke all on function promote_amenity_waitlist(uuid, timestamptz, timestamptz) from public;

create or replace function join_amenity_waitlist(
  p_amenity_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a amenities;
  overlap_count int;
  wait_id uuid;
begin
  if my_role() <> 'resident' or my_flat() is null then
    raise exception 'residents only' using errcode = '42501';
  end if;
  select * into a from amenities
   where id = p_amenity_id and society_id = my_society() and is_active;
  if not found then raise exception 'amenity unavailable'; end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'invalid booking time';
  end if;
  if extract(epoch from (p_ends_at - p_starts_at)) / 60 <> a.slot_minutes then
    raise exception 'booking must match an available slot';
  end if;

  select count(*) into overlap_count from amenity_bookings
   where amenity_id = a.id
     and status = any (amenity_capacity_statuses())
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
  if overlap_count < a.capacity then
    raise exception 'slot still has capacity — book it directly' using errcode = '23514';
  end if;

  insert into amenity_waitlist (
    society_id, amenity_id, flat_id, requested_by, starts_at, ends_at
  ) values (
    a.society_id, a.id, my_flat(), clerk_uid(), p_starts_at, p_ends_at
  )
  on conflict (amenity_id, flat_id, starts_at, ends_at) do update
    set status = 'waiting',
        requested_by = excluded.requested_by
  where amenity_waitlist.status in ('cancelled', 'expired')
  returning id into wait_id;

  if wait_id is null then
    select id into wait_id from amenity_waitlist
     where amenity_id = a.id and flat_id = my_flat()
       and starts_at = p_starts_at and ends_at = p_ends_at;
  end if;
  return wait_id;
end $$;
revoke all on function join_amenity_waitlist(uuid, timestamptz, timestamptz) from public;
grant execute on function join_amenity_waitlist(uuid, timestamptz, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #47 Cancel (with optional late penalty) + promote waitlist
-- ─────────────────────────────────────────────────────────────────────────
create or replace function cancel_my_amenity_booking(
  p_booking_id uuid,
  p_accept_penalty boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b record;
  late boolean := false;
  penalty_id uuid;
begin
  select ab.*, a.cancellation_cutoff_minutes, a.late_cancel_penalty, a.society_id, a.name
    into b
  from amenity_bookings ab
  join amenities a on a.id = ab.amenity_id
  where ab.id = p_booking_id and ab.booked_by = clerk_uid()
  for update of ab;
  if not found or b.status not in ('pending', 'confirmed', 'pending_payment', 'waitlisted') then
    raise exception 'booking cannot be cancelled' using errcode = '23514';
  end if;

  if b.status = 'waitlisted' then
    update amenity_bookings set status = 'cancelled' where id = p_booking_id;
    return jsonb_build_object('id', p_booking_id, 'status', 'cancelled', 'penalty', false);
  end if;

  late := now() > b.starts_at - make_interval(mins => b.cancellation_cutoff_minutes);
  if late and b.status in ('pending', 'confirmed') then
    if b.late_cancel_penalty > 0 and not coalesce(p_accept_penalty, false) then
      raise exception 'cancellation window has closed; accept the late-cancel penalty to proceed'
        using errcode = 'P0001';
    end if;
    if not coalesce(p_accept_penalty, false) and b.late_cancel_penalty <= 0 then
      raise exception 'cancellation window has closed' using errcode = 'P0001';
    end if;
  end if;

  update amenity_bookings set status = 'cancelled' where id = p_booking_id;

  if late and b.late_cancel_penalty > 0 and b.status in ('pending', 'confirmed') then
    insert into amenity_penalties (society_id, flat_id, booking_id, kind, amount, note)
    values (
      b.society_id, b.flat_id, b.id, 'late_cancel', b.late_cancel_penalty,
      'Late cancellation of ' || b.name
    ) returning id into penalty_id;
  end if;

  perform promote_amenity_waitlist(b.amenity_id, b.starts_at, b.ends_at);

  return jsonb_build_object(
    'id', p_booking_id,
    'status', 'cancelled',
    'penalty', penalty_id is not null,
    'penaltyId', penalty_id
  );
end $$;
revoke all on function cancel_my_amenity_booking(uuid) from public;
revoke all on function cancel_my_amenity_booking(uuid, boolean) from public;
drop function if exists cancel_my_amenity_booking(uuid);
grant execute on function cancel_my_amenity_booking(uuid, boolean) to authenticated;

-- Also promote when admin rejects
create or replace function decide_amenity_booking(
  p_booking_id uuid, p_decision text, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller profiles;
  booking record;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'rejection reason is required' using errcode = '22023';
  end if;
  select b.*, a.name into booking
  from amenity_bookings b
  join amenities a on a.id = b.amenity_id
  where b.id = p_booking_id and a.society_id = caller.society_id
  for update of b;
  if not found or booking.status <> 'pending' then
    raise exception 'booking is no longer pending' using errcode = '23514';
  end if;

  update amenity_bookings
     set status = p_decision,
         decided_by = caller.id,
         decided_at = now(),
         decision_reason = nullif(trim(coalesce(p_reason, '')), ''),
         access_code = case
           when p_decision = 'confirmed' then coalesce(access_code, amenity_generate_access_code())
           else access_code
         end
   where id = p_booking_id;

  insert into notifications(user_id, type, payload) values (
    booking.booked_by, 'amenity_booking',
    jsonb_build_object(
      'title', 'Amenity booking ' || case when p_decision = 'confirmed' then 'approved' else 'rejected' end,
      'body', booking.name || coalesce(': ' || nullif(trim(coalesce(p_reason, '')), ''), ''),
      'url', '/(resident)/amenities',
      'bookingId', booking.id
    )
  );

  if p_decision = 'rejected' then
    perform promote_amenity_waitlist(booking.amenity_id, booking.starts_at, booking.ends_at);
  end if;

  return jsonb_build_object('id', booking.id, 'status', p_decision);
end $$;
revoke all on function decide_amenity_booking(uuid, text, text) from public;
grant execute on function decide_amenity_booking(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #44 Recurring series
-- ─────────────────────────────────────────────────────────────────────────
create or replace function book_amenity_series(
  p_amenity_id uuid,
  p_starts_at timestamptz,
  p_weeks int default 4
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a amenities;
  weeks int := least(greatest(coalesce(p_weeks, 4), 2), 12);
  series_id uuid;
  slot_end timestamptz;
  cursor_start timestamptz;
  booked uuid[] := '{}';
  skipped int := 0;
  booking_id uuid;
  weekday int;
  start_minute int;
begin
  if my_role() <> 'resident' or my_flat() is null then
    raise exception 'residents only';
  end if;
  select * into a from amenities
   where id = p_amenity_id and society_id = my_society() and is_active for update;
  if not found then raise exception 'amenity unavailable'; end if;
  if p_starts_at <= now() then raise exception 'invalid booking time'; end if;
  slot_end := p_starts_at + make_interval(mins => a.slot_minutes);
  if p_starts_at::time < a.open_time or slot_end::time > a.close_time then
    raise exception 'booking must match an available slot';
  end if;

  weekday := extract(dow from p_starts_at)::int;
  start_minute := (extract(hour from p_starts_at) * 60 + extract(minute from p_starts_at))::int;

  insert into amenity_recurring_series (
    society_id, amenity_id, flat_id, booked_by, weekday, start_minute, slot_minutes, weeks
  ) values (
    a.society_id, a.id, my_flat(), clerk_uid(), weekday, start_minute, a.slot_minutes, weeks
  ) returning id into series_id;

  for i in 0..(weeks - 1) loop
    cursor_start := p_starts_at + make_interval(weeks => i);
    begin
      booking_id := book_amenity(a.id, cursor_start, cursor_start + make_interval(mins => a.slot_minutes));
      update amenity_bookings set series_id = series_id where id = booking_id;
      booked := array_append(booked, booking_id);
    exception when others then
      skipped := skipped + 1;
    end;
  end loop;

  if cardinality(booked) = 0 then
    update amenity_recurring_series set status = 'cancelled' where id = series_id;
    raise exception 'could not book any occurrence in the series' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'seriesId', series_id,
    'bookedIds', to_jsonb(booked),
    'bookedCount', cardinality(booked),
    'skipped', skipped
  );
end $$;
revoke all on function book_amenity_series(uuid, timestamptz, int) from public;
grant execute on function book_amenity_series(uuid, timestamptz, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #46 QR amenity access
-- ─────────────────────────────────────────────────────────────────────────
create or replace function redeem_amenity_access(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  code text := nullif(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), '');
  b record;
  grace int;
begin
  if my_role() not in ('guard', 'admin') then
    raise exception 'guard or admin role required' using errcode = '42501';
  end if;
  if code is null or length(code) <> 6 then
    raise exception 'enter a 6-digit amenity code' using errcode = '22023';
  end if;

  select ab.*, a.name, a.society_id, a.checkin_grace_minutes, f.number as flat_number
    into b
  from amenity_bookings ab
  join amenities a on a.id = ab.amenity_id
  join flats f on f.id = ab.flat_id
  where ab.access_code = code
    and a.society_id = my_society()
  for update of ab;
  if not found then
    raise exception 'amenity code not found' using errcode = 'P0001';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'booking is not confirmed' using errcode = '23514';
  end if;
  if b.checked_in_at is not null then
    raise exception 'access code already used' using errcode = '23514';
  end if;

  grace := coalesce(b.checkin_grace_minutes, 15);
  if now() < b.starts_at - make_interval(mins => grace) then
    raise exception 'too early for this booking' using errcode = '23514';
  end if;
  if now() > b.ends_at + make_interval(mins => grace) then
    raise exception 'booking window has ended' using errcode = '23514';
  end if;

  update amenity_bookings set checked_in_at = now() where id = b.id;

  insert into amenity_booking_events(booking_id, from_status, to_status, actor_id, reason)
  values (b.id, b.status, b.status, clerk_uid(), 'checked_in');

  return jsonb_build_object(
    'bookingId', b.id,
    'amenityName', b.name,
    'flatNumber', b.flat_number,
    'startsAt', b.starts_at,
    'endsAt', b.ends_at,
    'checkedInAt', now()
  );
end $$;
revoke all on function redeem_amenity_access(text) from public;
grant execute on function redeem_amenity_access(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #47 Mark no-shows (admin / scheduled worker)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function mark_amenity_no_shows(p_limit int default 100)
returns int
language plpgsql security definer set search_path = public as $$
declare
  marked int := 0;
  r record;
begin
  if my_role() is distinct from 'admin' and clerk_uid() is not null then
    raise exception 'admins only' using errcode = '42501';
  end if;

  for r in
    select ab.id, ab.flat_id, a.society_id, a.no_show_penalty, a.name
    from amenity_bookings ab
    join amenities a on a.id = ab.amenity_id
    where ab.status = 'confirmed'
      and ab.checked_in_at is null
      and ab.ends_at < now()
      and (my_society() is null or a.society_id = my_society())
    order by ab.ends_at
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update of ab skip locked
  loop
    update amenity_bookings set status = 'no_show' where id = r.id;
    if r.no_show_penalty > 0 then
      insert into amenity_penalties (society_id, flat_id, booking_id, kind, amount, note)
      values (r.society_id, r.flat_id, r.id, 'no_show', r.no_show_penalty, 'No-show: ' || r.name);
    end if;
    marked := marked + 1;
  end loop;
  return marked;
end $$;
revoke all on function mark_amenity_no_shows(int) from public;
grant execute on function mark_amenity_no_shows(int) to authenticated;
grant execute on function mark_amenity_no_shows(int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- #49 Amenity usage analytics
-- ─────────────────────────────────────────────────────────────────────────
create or replace function amenity_usage_stats(p_days int default 30)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  caller record;
  since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
begin
  select role, society_id into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return (
    with society_bookings as (
      select ab.*, a.name as amenity_name, a.price
      from amenity_bookings ab
      join amenities a on a.id = ab.amenity_id
      where a.society_id = caller.society_id
        and ab.created_at >= since
    ),
    by_amenity as (
      select amenity_id, amenity_name,
             count(*) as bookings,
             count(*) filter (where status = 'confirmed') as confirmed,
             count(*) filter (where status = 'cancelled') as cancelled,
             count(*) filter (where status = 'no_show') as no_shows,
             count(*) filter (where checked_in_at is not null) as checked_in,
             coalesce(sum(payment_amount) filter (where paid_at is not null), 0) as revenue
      from society_bookings
      group by amenity_id, amenity_name
      order by bookings desc
      limit 20
    )
    select jsonb_build_object(
      'days', greatest(coalesce(p_days, 30), 1),
      'total_bookings', (select count(*) from society_bookings),
      'confirmed', (select count(*) from society_bookings where status = 'confirmed'),
      'cancelled', (select count(*) from society_bookings where status = 'cancelled'),
      'no_shows', (select count(*) from society_bookings where status = 'no_show'),
      'checked_in', (select count(*) from society_bookings where checked_in_at is not null),
      'pending_payment', (select count(*) from society_bookings where status = 'pending_payment'),
      'waitlist_waiting', (
        select count(*) from amenity_waitlist w
        where w.society_id = caller.society_id and w.status = 'waiting' and w.created_at >= since
      ),
      'revenue', (select coalesce(sum(payment_amount), 0) from society_bookings where paid_at is not null),
      'penalties_due', (
        select coalesce(sum(amount), 0) from amenity_penalties p
        where p.society_id = caller.society_id and p.status = 'due' and p.created_at >= since
      ),
      'by_amenity', coalesce((select jsonb_agg(to_jsonb(by_amenity)) from by_amenity), '[]'::jsonb)
    )
  );
end $$;
revoke all on function amenity_usage_stats(int) from public;
grant execute on function amenity_usage_stats(int) to authenticated;
