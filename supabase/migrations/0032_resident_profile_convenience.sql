-- 0032_resident_profile_convenience.sql
-- Section 6: digital resident ID (#62), family manager (#63),
-- domestic-help daily check-in (#66).

-- ─────────────────────────────────────────────────────────────────────────
-- #62 Digital Resident ID (non-burnable QR)
-- ─────────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists resident_id_code text;

-- Unique within a society when set.
create unique index if not exists profiles_society_resident_id_uidx
  on profiles (society_id, resident_id_code)
  where resident_id_code is not null;

create or replace function generate_resident_id_code()
returns text
language plpgsql
as $$
declare
  v_code text;
  i int;
begin
  for i in 1..20 loop
    v_code := 'R' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (
      select 1 from profiles where resident_id_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

create or replace function ensure_my_resident_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  v_code text;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'resident' then
    raise exception 'residents only' using errcode = '42501';
  end if;
  if caller.resident_id_code is not null then
    return caller.resident_id_code;
  end if;
  v_code := generate_resident_id_code();
  update profiles set resident_id_code = v_code where id = caller.id;
  return v_code;
end;
$$;
revoke all on function ensure_my_resident_id() from public;
grant execute on function ensure_my_resident_id() to authenticated;

-- Guard/admin verify (does NOT burn the code).
create or replace function verify_resident_id(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  target profiles;
  flat_number text;
  recent_failures int;
  normalized text;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('guard', 'admin') then
    raise exception 'guard or admin role required' using errcode = '42501';
  end if;

  select count(*) into recent_failures
    from gate_code_attempts
   where guard_id = caller.id
     and success = false
     and attempted_at > now() - interval '10 minutes';
  if recent_failures >= 5 then
    return jsonb_build_object(
      'ok', false, 'code', 'rate_limited',
      'message', 'Too many failed scans. Wait a few minutes.'
    );
  end if;

  normalized := upper(btrim(coalesce(p_code, '')));
  -- Accept raw R######## or URLs containing it.
  if normalized ~ 'R[0-9]{8}' then
    normalized := substring(normalized from 'R[0-9]{8}');
  end if;

  if normalized !~ '^R[0-9]{8}$' then
    insert into gate_code_attempts (guard_id, success) values (caller.id, false);
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_format',
      'message', 'Resident ID codes look like R12345678.'
    );
  end if;

  select * into target
  from profiles
  where society_id = caller.society_id
    and role = 'resident'
    and resident_id_code = normalized;

  if not found then
    insert into gate_code_attempts (guard_id, success) values (caller.id, false);
    return jsonb_build_object(
      'ok', false, 'code', 'not_found',
      'message', 'No resident matches that ID.'
    );
  end if;

  select number into flat_number from flats where id = target.flat_id;
  insert into gate_code_attempts (guard_id, success) values (caller.id, true);

  return jsonb_build_object(
    'ok', true,
    'name', target.name,
    'flatNumber', coalesce(flat_number, '—'),
    'phone', target.phone,
    'code', target.resident_id_code
  );
end;
$$;
revoke all on function verify_resident_id(text) from public;
grant execute on function verify_resident_id(text) to authenticated;

-- Backfill existing residents.
update profiles
   set resident_id_code = generate_resident_id_code()
 where role = 'resident'
   and resident_id_code is null;

-- ─────────────────────────────────────────────────────────────────────────
-- #63 Family manager — list + remove flatmates, cancel invites
-- ─────────────────────────────────────────────────────────────────────────
create or replace function my_flat_members()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_flat uuid := my_flat();
  v_rows jsonb;
begin
  if v_flat is null or my_role() <> 'resident' then
    raise exception 'linked resident required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'phone', p.phone,
    'email', p.email,
    'isSelf', p.id = clerk_uid(),
    'createdAt', p.created_at
  ) order by p.created_at), '[]'::jsonb)
  into v_rows
  from profiles p
  where p.flat_id = v_flat and p.role = 'resident';
  return v_rows;
end;
$$;
revoke all on function my_flat_members() from public;
grant execute on function my_flat_members() to authenticated;

create or replace function remove_flat_member(p_profile_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  target profiles;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'resident' or caller.flat_id is null then
    raise exception 'linked resident required' using errcode = '42501';
  end if;
  if p_profile_id = caller.id then
    raise exception 'use leave household to remove yourself' using errcode = '22023';
  end if;
  select * into target from profiles where id = p_profile_id;
  if not found
     or target.society_id <> caller.society_id
     or target.flat_id is distinct from caller.flat_id
     or target.role <> 'resident' then
    raise exception 'member not found in your flat' using errcode = '42501';
  end if;
  update profiles set flat_id = null where id = target.id;
end;
$$;
revoke all on function remove_flat_member(text) from public;
grant execute on function remove_flat_member(text) to authenticated;

create or replace function cancel_household_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if my_role() <> 'resident' or my_flat() is null then
    raise exception 'linked resident required' using errcode = '42501';
  end if;
  delete from invites
   where id = p_invite_id
     and flat_id = my_flat()
     and society_id = my_society()
     and claimed_by is null;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'invite not found or already claimed' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function cancel_household_invite(uuid) from public;
grant execute on function cancel_household_invite(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #66 Domestic helpers + daily attendance
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists domestic_helpers (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  name text not null,
  role text not null default 'maid'
    check (role in ('maid', 'cook', 'driver', 'other')),
  phone text,
  checkin_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (society_id, checkin_code)
);
create index if not exists domestic_helpers_flat_idx
  on domestic_helpers (flat_id, is_active);
alter table domestic_helpers enable row level security;
create policy domestic_helpers_flat_all on domestic_helpers for all
  using (society_id = my_society() and flat_id = my_flat())
  with check (society_id = my_society() and flat_id = my_flat());
create policy domestic_helpers_staff_read on domestic_helpers for select
  using (society_id = my_society() and my_role() in ('guard', 'admin'));

create table if not exists domestic_attendance (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  helper_id uuid not null references domestic_helpers(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  checked_in_by text references profiles(id) on delete set null,
  checked_out_by text references profiles(id) on delete set null,
  method text not null default 'manual'
    check (method in ('manual', 'qr', 'code')),
  created_at timestamptz not null default now()
);
create index if not exists domestic_attendance_helper_day_idx
  on domestic_attendance (helper_id, checked_in_at desc);
create index if not exists domestic_attendance_flat_open_idx
  on domestic_attendance (flat_id, checked_out_at);
alter table domestic_attendance enable row level security;
create policy domestic_attendance_flat_read on domestic_attendance for select
  using (
    society_id = my_society()
    and (flat_id = my_flat() or my_role() in ('guard', 'admin'))
  );
-- Writes via RPCs only.
create policy domestic_attendance_no_direct_insert on domestic_attendance
  for insert with check (false);
create policy domestic_attendance_no_direct_update on domestic_attendance
  for update using (false);

create or replace function generate_helper_checkin_code()
returns text
language plpgsql
as $$
declare
  v_code text;
  i int;
begin
  for i in 1..20 loop
    v_code := 'H' || lpad((floor(random() * 1000000))::bigint::text, 6, '0');
    exit when not exists (
      select 1 from domestic_helpers where checkin_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

create or replace function check_in_domestic_helper(
  p_code text default null,
  p_helper_id uuid default null,
  p_method text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  helper domestic_helpers;
  open_log domestic_attendance;
  log_id uuid;
  normalized text;
  flat_number text;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_method not in ('manual', 'qr', 'code') then
    p_method := 'manual';
  end if;

  if p_helper_id is not null then
    select * into helper from domestic_helpers where id = p_helper_id and is_active;
  else
    normalized := upper(btrim(coalesce(p_code, '')));
    if normalized ~ 'H[0-9]{6}' then
      normalized := substring(normalized from 'H[0-9]{6}');
    end if;
    select * into helper
    from domestic_helpers
    where society_id = caller.society_id
      and checkin_code = normalized
      and is_active;
  end if;

  if not found then
    raise exception 'helper not found' using errcode = 'P0001';
  end if;

  -- Residents may only check in their own flat's help; guards/admins any in society.
  if caller.role = 'resident' and helper.flat_id is distinct from caller.flat_id then
    raise exception 'not your flat''s helper' using errcode = '42501';
  end if;
  if caller.role not in ('resident', 'guard', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into open_log
  from domestic_attendance
  where helper_id = helper.id and checked_out_at is null
  order by checked_in_at desc limit 1;
  if found then
    return jsonb_build_object(
      'ok', true,
      'alreadyIn', true,
      'attendanceId', open_log.id,
      'helperName', helper.name,
      'role', helper.role
    );
  end if;

  insert into domestic_attendance (
    society_id, flat_id, helper_id, checked_in_by, method
  ) values (
    helper.society_id, helper.flat_id, helper.id, caller.id, p_method
  ) returning id into log_id;

  select number into flat_number from flats where id = helper.flat_id;

  return jsonb_build_object(
    'ok', true,
    'alreadyIn', false,
    'attendanceId', log_id,
    'helperName', helper.name,
    'role', helper.role,
    'flatNumber', coalesce(flat_number, '—')
  );
end;
$$;
revoke all on function check_in_domestic_helper(text, uuid, text) from public;
grant execute on function check_in_domestic_helper(text, uuid, text) to authenticated;

create or replace function check_out_domestic_helper(p_attendance_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  log domestic_attendance;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found then raise exception 'not signed in' using errcode = '28000'; end if;

  select * into log from domestic_attendance where id = p_attendance_id for update;
  if not found or log.society_id <> caller.society_id then
    raise exception 'attendance not found' using errcode = '42501';
  end if;
  if caller.role = 'resident' and log.flat_id is distinct from caller.flat_id then
    raise exception 'not your flat' using errcode = '42501';
  end if;
  if caller.role not in ('resident', 'guard', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if log.checked_out_at is not null then
    raise exception 'already checked out' using errcode = '23514';
  end if;

  update domestic_attendance
     set checked_out_at = now(), checked_out_by = caller.id
   where id = p_attendance_id;
end;
$$;
revoke all on function check_out_domestic_helper(uuid) from public;
grant execute on function check_out_domestic_helper(uuid) to authenticated;

create or replace function domestic_on_duty(p_flat_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  caller profiles;
  v_flat uuid;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found then raise exception 'not signed in' using errcode = '28000'; end if;

  if caller.role = 'resident' then
    v_flat := caller.flat_id;
  else
    v_flat := p_flat_id;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'attendanceId', a.id,
      'helperId', h.id,
      'helperName', h.name,
      'role', h.role,
      'flatNumber', f.number,
      'checkedInAt', a.checked_in_at,
      'method', a.method
    ) order by a.checked_in_at desc)
    from domestic_attendance a
    join domestic_helpers h on h.id = a.helper_id
    join flats f on f.id = a.flat_id
    where a.society_id = caller.society_id
      and a.checked_out_at is null
      and (v_flat is null or a.flat_id = v_flat)
      and (
        caller.role in ('guard', 'admin')
        or a.flat_id = caller.flat_id
      )
  ), '[]'::jsonb);
end;
$$;
revoke all on function domestic_on_duty(uuid) from public;
grant execute on function domestic_on_duty(uuid) to authenticated;
