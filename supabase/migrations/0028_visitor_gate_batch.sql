-- 0028_visitor_gate_batch.sql
-- Section 1 (Visitor & Gate Entry) backlog: favorites (#18/#19), vehicle
-- registry + registered-plate auto-approve (#23 practical / #24), parcel
-- locker (#16), recurring passes (#17), group/event passes (#6/#20/#26/#103),
-- "leave at gate" handling (#4), smart visitor insights (#7), and expiry
-- escalation (#12). The hardened redeem_gate_code / decide_visitor_request
-- RPCs are NOT modified — new features use their own tables + RPCs.

-- ─────────────────────────────────────────────────────────────────────────
-- #18/#19 Favorite visitors
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists favorite_visitors (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  name text not null,
  phone text,
  type text not null check (type in ('guest','delivery','cab','service')),
  vehicle_no text,
  created_at timestamptz not null default now()
);
create index if not exists favorite_visitors_flat_idx on favorite_visitors(flat_id);
alter table favorite_visitors enable row level security;
create policy favorite_visitors_owner on favorite_visitors for all
  using (society_id = my_society() and flat_id = my_flat())
  with check (society_id = my_society() and flat_id = my_flat() and created_by = clerk_uid());
create policy favorite_visitors_staff_read on favorite_visitors for select
  using (society_id = my_society() and my_role() in ('guard','admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- #23/#24 Vehicle registry + registered-plate fast-track
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists resident_vehicles (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  plate text not null,
  label text,
  auto_approve boolean not null default false,
  created_at timestamptz not null default now(),
  unique (society_id, plate)
);
create index if not exists resident_vehicles_society_idx on resident_vehicles(society_id);
alter table resident_vehicles enable row level security;
create policy resident_vehicles_owner on resident_vehicles for all
  using (society_id = my_society() and flat_id = my_flat())
  with check (society_id = my_society() and flat_id = my_flat() and created_by = clerk_uid());
create policy resident_vehicles_staff_read on resident_vehicles for select
  using (society_id = my_society() and my_role() in ('guard','admin'));

-- Guard looks up a plate at the gate. Returns owner flat + auto_approve flag.
create or replace function lookup_vehicle(p_plate text)
returns jsonb
language plpgsql security definer set search_path = public stable
as $$
declare v_result jsonb;
begin
  if my_role() not in ('guard','admin') then
    raise exception 'guard or admin role required';
  end if;
  select jsonb_build_object(
    'plate', rv.plate,
    'label', rv.label,
    'auto_approve', rv.auto_approve,
    'flat_number', f.number,
    'owner_name', p.name
  ) into v_result
  from resident_vehicles rv
  join flats f on f.id = rv.flat_id
  left join profiles p on p.id = rv.created_by
  where rv.society_id = my_society()
    and upper(regexp_replace(rv.plate, '[^A-Za-z0-9]', '', 'g'))
        = upper(regexp_replace(coalesce(p_plate,''), '[^A-Za-z0-9]', '', 'g'))
  limit 1;
  return coalesce(v_result, '{}'::jsonb);
end $$;
revoke all on function lookup_vehicle(text) from public;
grant execute on function lookup_vehicle(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #16 Parcel / locker tracking
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists parcels (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  logged_by text not null references profiles(id) on delete set null,
  description text not null,
  shelf_label text,
  photo_ref text,
  status text not null default 'pending' check (status in ('pending','collected')),
  collected_by text references profiles(id) on delete set null,
  collected_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists parcels_flat_status_idx on parcels(flat_id, status);
alter table parcels enable row level security;
-- Guards/admins log & manage; the flat's residents can read and mark collected.
create policy parcels_staff_write on parcels for insert
  with check (society_id = my_society() and my_role() in ('guard','admin') and logged_by = clerk_uid());
create policy parcels_read on parcels for select
  using (society_id = my_society() and (my_role() in ('guard','admin') or flat_id = my_flat()));
create policy parcels_update on parcels for update
  using (society_id = my_society() and (my_role() in ('guard','admin') or flat_id = my_flat()))
  with check (society_id = my_society());

-- Notify the flat when a parcel is logged.
create or replace function on_parcel_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_flat_residents(
    new.flat_id, 'parcel',
    jsonb_build_object(
      'title', 'Package at gate',
      'body', new.description ||
              coalesce(' — Shelf ' || new.shelf_label, ''),
      'url', '/(resident)/parcels'
    )
  );
  return new;
end $$;
revoke all on function on_parcel_insert() from public;
drop trigger if exists trg_on_parcel_insert on parcels;
create trigger trg_on_parcel_insert after insert on parcels
  for each row execute function on_parcel_insert();

-- ─────────────────────────────────────────────────────────────────────────
-- #17 Recurring passes (maid/cook/driver windows) — advisory match for guards
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists recurring_passes (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('guest','delivery','cab','service')),
  days_of_week int[] not null default '{}',            -- 0=Sun .. 6=Sat
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 1 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_minute > start_minute)
);
create index if not exists recurring_passes_flat_idx on recurring_passes(flat_id);
alter table recurring_passes enable row level security;
create policy recurring_passes_owner on recurring_passes for all
  using (society_id = my_society() and flat_id = my_flat())
  with check (society_id = my_society() and flat_id = my_flat() and created_by = clerk_uid());
create policy recurring_passes_staff_read on recurring_passes for select
  using (society_id = my_society() and my_role() in ('guard','admin'));

-- Does a named visitor currently match an active recurring window for a flat?
create or replace function recurring_pass_matches(p_flat_id uuid, p_name text)
returns boolean
language plpgsql security definer set search_path = public stable
as $$
declare
  v_dow int := extract(dow from now())::int;                 -- 0..6
  v_min int := (extract(hour from now())*60 + extract(minute from now()))::int;
  v_hit boolean;
begin
  if my_role() not in ('guard','admin') then
    raise exception 'guard or admin role required';
  end if;
  select exists(
    select 1 from recurring_passes rp
     where rp.flat_id = p_flat_id
       and rp.society_id = my_society()
       and rp.active
       and v_dow = any(rp.days_of_week)
       and v_min between rp.start_minute and rp.end_minute
       and lower(btrim(rp.name)) = lower(btrim(coalesce(p_name,'')))
  ) into v_hit;
  return coalesce(v_hit, false);
end $$;
revoke all on function recurring_pass_matches(uuid, text) from public;
grant execute on function recurring_pass_matches(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #6/#20/#26/#103 Group / event passes (multi-use shareable code)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists group_passes (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  label text not null,
  type text not null default 'guest' check (type in ('guest','delivery','cab','service')),
  code text not null unique,
  max_uses int not null check (max_uses between 1 and 500),
  uses int not null default 0,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  created_at timestamptz not null default now(),
  check (valid_to > valid_from)
);
create index if not exists group_passes_flat_idx on group_passes(flat_id);
alter table group_passes enable row level security;
create policy group_passes_owner on group_passes for all
  using (society_id = my_society() and flat_id = my_flat())
  with check (society_id = my_society() and flat_id = my_flat() and created_by = clerk_uid());
create policy group_passes_staff_read on group_passes for select
  using (society_id = my_society() and my_role() in ('guard','admin'));

-- Guard admits one guest against a group code (bulk/event entry).
create or replace function redeem_group_code(p_code text, p_guest_name text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  gp group_passes;
  v_visitor uuid;
  v_flat_number text;
begin
  if my_role() not in ('guard','admin') then
    raise exception 'guard or admin role required';
  end if;

  select * into gp from group_passes
   where code = p_code and society_id = my_society()
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Group code not found.');
  end if;
  if now() < gp.valid_from or now() > gp.valid_to then
    return jsonb_build_object('ok', false, 'message', 'Group pass is not active right now.');
  end if;
  if gp.uses >= gp.max_uses then
    return jsonb_build_object('ok', false, 'message', 'Group pass is fully used.');
  end if;

  insert into visitors (society_id, flat_id, type, name)
  values (gp.society_id, gp.flat_id, gp.type,
          coalesce(nullif(btrim(p_guest_name),''), gp.label || ' guest'))
  returning id into v_visitor;

  insert into gate_logs (visitor_id, entry_at, entry_guard_id, method)
  values (v_visitor, now(), clerk_uid(), 'pre_approved');

  update group_passes set uses = uses + 1 where id = gp.id;

  select number into v_flat_number from flats where id = gp.flat_id;

  return jsonb_build_object(
    'ok', true,
    'visitor_name', coalesce(nullif(btrim(p_guest_name),''), gp.label || ' guest'),
    'type', gp.type,
    'flat_number', coalesce(v_flat_number, ''),
    'remaining', gp.max_uses - gp.uses - 1
  );
end $$;
revoke all on function redeem_group_code(text, text) from public;
grant execute on function redeem_group_code(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #4 "Leave at gate" handling on a visitor request
-- ─────────────────────────────────────────────────────────────────────────
alter table visitor_requests
  add column if not exists handling text
    check (handling is null or handling in ('normal','leave_at_gate'));

-- Resident marks a request they can see as "leave at gate".
create or replace function set_request_handling(p_request_id uuid, p_handling text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_handling not in ('normal','leave_at_gate') then
    raise exception 'invalid handling';
  end if;
  update visitor_requests vr
     set handling = p_handling
    from visitors v
   where vr.id = p_request_id
     and v.id = vr.visitor_id
     and v.society_id = my_society()
     and v.flat_id = my_flat();
  if not found then
    raise exception 'request not found';
  end if;
end $$;
revoke all on function set_request_handling(uuid, text) from public;
grant execute on function set_request_handling(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #7 Smart visitor insights (history-based; no external AI)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function visitor_insights(p_phone text)
returns jsonb
language plpgsql security definer set search_path = public stable
as $$
declare
  v_norm text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  v_result jsonb;
begin
  if my_society() is null then
    raise exception 'not a society member';
  end if;
  if length(v_norm) < 6 then
    return jsonb_build_object('visit_count', 0, 'known', false);
  end if;
  select jsonb_build_object(
    'visit_count', count(gl.id),
    'last_seen_at', max(gl.entry_at),
    'first_seen_at', min(gl.entry_at),
    'avg_hour', round(avg(extract(hour from gl.entry_at))::numeric, 0),
    'known', count(gl.id) >= 3
  ) into v_result
  from gate_logs gl
  join visitors v on v.id = gl.visitor_id
  where v.society_id = my_society()
    and regexp_replace(coalesce(v.phone,''), '[^0-9]', '', 'g') = v_norm;
  return coalesce(v_result, jsonb_build_object('visit_count', 0, 'known', false));
end $$;
revoke all on function visitor_insights(text) from public;
grant execute on function visitor_insights(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #12 Escalation: notify flat residents + admins when a request expires
-- ─────────────────────────────────────────────────────────────────────────
create or replace function expire_stale_requests() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  affected integer := 0;
  r record;
begin
  -- Expire in one statement and iterate exactly the rows we just expired,
  -- so escalation fires once per request regardless of how often this runs.
  for r in
    with expired as (
      update visitor_requests vr
         set status = 'expired', decided_at = now()
        from visitors v
       where v.id = vr.visitor_id
         and vr.status = 'pending'
         and vr.created_at
             < now() - make_interval(mins => visitor_expiry_minutes(v.society_id))
      returning vr.id, v.flat_id, v.society_id, v.name
    )
    select id, flat_id, society_id, name from expired
  loop
    affected := affected + 1;
    perform notify_flat_residents(
      r.flat_id, 'visitor_expired',
      jsonb_build_object(
        'title', 'Visitor request went unanswered',
        'body', coalesce(r.name,'A visitor') || ' at the gate was not approved in time.',
        'url', '/(resident)/pre-approvals'
      )
    );
    perform notify_society_role(
      r.society_id, 'admin', 'visitor_expired',
      jsonb_build_object(
        'title', 'Unanswered visitor request',
        'body', coalesce(r.name,'A visitor') || ' expired without a resident response.',
        'url', '/(admin)/history'
      )
    );
  end loop;

  return affected;
end $$;
revoke all on function expire_stale_requests() from public;
