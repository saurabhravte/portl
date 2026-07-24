-- 0029_security_safety_batch.sql
-- Security backlog: blacklist/watchlist (#29), CCTV cameras (#34),
-- and smart-lock / IoT gate commands (#35). Biometric step-up (#31) is
-- client-only (expo-local-authentication) and needs no schema.

-- ─────────────────────────────────────────────────────────────────────────
-- #29 Visitor blacklist / watchlist
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists visitor_watchlist (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  kind text not null check (kind in ('blacklist', 'watchlist')),
  name text,
  phone text,
  vehicle_no text,
  reason text not null,
  is_active boolean not null default true,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    nullif(btrim(coalesce(name, '')), '') is not null
    or nullif(btrim(coalesce(phone, '')), '') is not null
    or nullif(btrim(coalesce(vehicle_no, '')), '') is not null
  )
);

create index if not exists visitor_watchlist_society_active_idx
  on visitor_watchlist (society_id, is_active, kind);

alter table visitor_watchlist enable row level security;

create policy visitor_watchlist_staff_read on visitor_watchlist for select
  using (society_id = my_society() and my_role() in ('guard', 'admin'));

create policy visitor_watchlist_admin_write on visitor_watchlist for all
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');

-- Match helpers (digits-only phone, scrubbed plate, case-insensitive name).
create or replace function watchlist_phone_digits(p_phone text)
returns text
language sql immutable as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
$$;

create or replace function watchlist_plate_key(p_plate text)
returns text
language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

create or replace function find_watchlist_matches(
  p_society_id uuid,
  p_phone text default null,
  p_name text default null,
  p_vehicle_no text default null
)
returns table (
  id uuid,
  kind text,
  name text,
  phone text,
  vehicle_no text,
  reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.kind, w.name, w.phone, w.vehicle_no, w.reason
  from visitor_watchlist w
  where w.society_id = p_society_id
    and w.is_active
    and (
      (
        watchlist_phone_digits(p_phone) is not null
        and watchlist_phone_digits(w.phone) = watchlist_phone_digits(p_phone)
      )
      or (
        watchlist_plate_key(p_vehicle_no) is not null
        and watchlist_plate_key(w.vehicle_no) = watchlist_plate_key(p_vehicle_no)
      )
      or (
        nullif(btrim(coalesce(p_name, '')), '') is not null
        and nullif(btrim(coalesce(w.name, '')), '') is not null
        and lower(btrim(w.name)) = lower(btrim(p_name))
      )
    );
$$;

revoke all on function find_watchlist_matches(uuid, text, text, text) from public;

-- Guard/admin gate lookup.
create or replace function lookup_watchlist(
  p_phone text default null,
  p_name text default null,
  p_vehicle_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_society uuid := my_society();
  v_rows jsonb;
begin
  if my_role() not in ('guard', 'admin') then
    raise exception 'guard or admin role required' using errcode = '42501';
  end if;
  if v_society is null then
    raise exception 'not a society member' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.kind, m.name), '[]'::jsonb)
    into v_rows
  from find_watchlist_matches(v_society, p_phone, p_name, p_vehicle_no) m;

  return jsonb_build_object(
    'matches', v_rows,
    'blocked', exists (
      select 1 from find_watchlist_matches(v_society, p_phone, p_name, p_vehicle_no) x
      where x.kind = 'blacklist'
    )
  );
end;
$$;

revoke all on function lookup_watchlist(text, text, text) from public;
grant execute on function lookup_watchlist(text, text, text) to authenticated;

-- Hard-block blacklisted visitors when raising a gate request.
create or replace function raise_visitor_request(
  p_idempotency_key uuid, p_flat_id uuid, p_name text, p_type text,
  p_phone text default null, p_vehicle_no text default null,
  p_photo_url text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller profiles;
  claimed_id uuid;
  prior record;
  existing record;
  visitor_id uuid;
  request_id uuid;
  response jsonb;
  v_watch jsonb;
  v_blocked boolean;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('guard', 'admin') then
    raise exception 'only gate staff can raise visitor requests' using errcode='42501';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required' using errcode='22023'; end if;
  if p_type not in ('guest','delivery','cab','service') or length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'invalid visitor details' using errcode='22023';
  end if;
  if not exists(select 1 from flats where id=p_flat_id and society_id=caller.society_id) then
    raise exception 'flat not found in your society' using errcode='42501';
  end if;

  select lookup_watchlist(p_phone, p_name, p_vehicle_no) into v_watch;
  v_blocked := coalesce((v_watch->>'blocked')::boolean, false);
  if v_blocked then
    perform notify_society_role(
      caller.society_id, 'admin', 'watchlist_block',
      jsonb_build_object(
        'title', 'Blacklisted visitor blocked',
        'body', trim(p_name) || ' matched a blacklist entry at the gate',
        'url', '/(admin)/manage/watchlist',
        'matches', v_watch->'matches'
      )
    );
    raise exception 'visitor matches an active blacklist entry'
      using errcode = 'P0001';
  end if;

  insert into gate_operations(idempotency_key,actor_id,society_id,operation)
  values(p_idempotency_key,caller.id,caller.society_id,'raise_visitor')
  on conflict(actor_id,idempotency_key) do nothing returning id into claimed_id;
  if claimed_id is null then
    select operation,result into prior from gate_operations
     where actor_id=caller.id and idempotency_key=p_idempotency_key;
    if prior.operation <> 'raise_visitor' then raise exception 'idempotency key reused for another operation' using errcode='22023'; end if;
    return prior.result;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_flat_id::text,0));
  select r.id,r.status into existing
    from visitor_requests r join visitors v on v.id=r.visitor_id
   where v.flat_id=p_flat_id and r.status='pending'
     and r.created_at>now()-interval '5 minutes'
     and (
       (nullif(regexp_replace(coalesce(p_phone,''),'\D','','g'),'') is not null
        and regexp_replace(coalesce(v.phone,''),'\D','','g')=
            regexp_replace(coalesce(p_phone,''),'\D','','g'))
       or lower(trim(v.name))=lower(trim(p_name))
     )
   order by r.created_at desc limit 1;
  if found then
    response := jsonb_build_object(
      'requestId',existing.id,'status',existing.status,'duplicate',true,
      'watchlist', coalesce(v_watch->'matches', '[]'::jsonb)
    );
  else
    insert into visitors(society_id,flat_id,type,name,phone,vehicle_no,photo_url)
    values(caller.society_id,p_flat_id,p_type,trim(p_name),nullif(trim(p_phone),''),
           nullif(trim(p_vehicle_no),''),nullif(trim(p_photo_url),''))
    returning id into visitor_id;
    insert into visitor_requests(visitor_id,raised_by)
    values(visitor_id,caller.id) returning id into request_id;
    response := jsonb_build_object(
      'requestId',request_id,
      'status',(select status from visitor_requests where id=request_id),
      'duplicate',false,
      'watchlist', coalesce(v_watch->'matches', '[]'::jsonb)
    );
  end if;
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

revoke all on function raise_visitor_request(uuid,uuid,text,text,text,text,text) from public;
grant execute on function raise_visitor_request(uuid,uuid,text,text,text,text,text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- #34 CCTV cameras (HLS / embed / snapshot URL configured by admin)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists cctv_cameras (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  gate_id uuid references gates(id) on delete set null,
  name text not null,
  stream_url text not null,
  stream_kind text not null default 'hls'
    check (stream_kind in ('hls', 'embed', 'snapshot')),
  is_active boolean not null default true,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (society_id, name)
);

create index if not exists cctv_cameras_society_idx on cctv_cameras(society_id, is_active);

alter table cctv_cameras enable row level security;

create policy cctv_cameras_staff_read on cctv_cameras for select
  using (society_id = my_society() and my_role() in ('guard', 'admin'));

create policy cctv_cameras_admin_write on cctv_cameras for all
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────
-- #35 Smart lock / IoT gate devices + open commands
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists gate_iot_devices (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  gate_id uuid not null references gates(id) on delete cascade,
  provider text not null check (provider in ('mock', 'webhook')),
  label text not null,
  external_id text,
  webhook_url text,
  is_active boolean not null default true,
  last_status text not null default 'unknown'
    check (last_status in ('unknown', 'locked', 'unlocked', 'error')),
  last_status_at timestamptz,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (gate_id),
  check (provider <> 'webhook' or nullif(btrim(coalesce(webhook_url, '')), '') is not null)
);

create index if not exists gate_iot_devices_society_idx
  on gate_iot_devices (society_id, is_active);

alter table gate_iot_devices enable row level security;

create policy gate_iot_devices_staff_read on gate_iot_devices for select
  using (society_id = my_society() and my_role() in ('guard', 'admin'));

create policy gate_iot_devices_admin_write on gate_iot_devices for all
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');

create table if not exists gate_open_commands (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  gate_id uuid not null references gates(id) on delete cascade,
  device_id uuid not null references gate_iot_devices(id) on delete cascade,
  requested_by text not null references profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'opened', 'failed', 'cancelled')),
  provider_response text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists gate_open_commands_society_idx
  on gate_open_commands (society_id, created_at desc);

alter table gate_open_commands enable row level security;

create policy gate_open_commands_staff_read on gate_open_commands for select
  using (society_id = my_society() and my_role() in ('guard', 'admin'));

-- Inserts go through the security-definer RPC only.
create policy gate_open_commands_no_direct_write on gate_open_commands
  for insert with check (false);
create policy gate_open_commands_no_direct_update on gate_open_commands
  for update using (false);

create or replace function request_gate_open(p_gate_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  device gate_iot_devices;
  command_id uuid;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('guard', 'admin') then
    raise exception 'only gate staff can request a gate open' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason (at least 3 characters) is required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from gates g
    where g.id = p_gate_id and g.society_id = caller.society_id and g.is_active
  ) then
    raise exception 'gate not found or inactive' using errcode = '42501';
  end if;

  select * into device
  from gate_iot_devices d
  where d.gate_id = p_gate_id
    and d.society_id = caller.society_id
    and d.is_active
  for update;
  if not found then
    raise exception 'no active IoT device configured for this gate' using errcode = 'P0001';
  end if;

  insert into gate_open_commands (
    society_id, gate_id, device_id, requested_by, reason
  ) values (
    caller.society_id, p_gate_id, device.id, caller.id, btrim(p_reason)
  ) returning id into command_id;

  insert into admin_audit_events (
    society_id, actor_id, actor_role, action, target_type, target_id,
    correlation_id, after_state
  ) values (
    caller.society_id,
    caller.id,
    caller.role,
    'gate_open_requested',
    'gate_open_commands',
    command_id::text,
    gen_random_uuid(),
    jsonb_build_object(
      'gate_id', p_gate_id,
      'device_id', device.id,
      'provider', device.provider,
      'reason', btrim(p_reason)
    )
  );

  perform notify_society_role(
    caller.society_id, 'admin', 'gate_open',
    jsonb_build_object(
      'title', 'Gate open requested',
      'body', coalesce(caller.name, 'Staff') || ' requested unlock — ' || btrim(p_reason),
      'url', '/(admin)/manage/gates',
      'command_id', command_id
    )
  );

  return jsonb_build_object(
    'commandId', command_id,
    'deviceId', device.id,
    'provider', device.provider,
    'status', 'pending'
  );
end;
$$;

revoke all on function request_gate_open(uuid, text) from public;
grant execute on function request_gate_open(uuid, text) to authenticated;

-- Service-role / edge helper to complete a command after provider call.
create or replace function complete_gate_open_command(
  p_command_id uuid,
  p_status text,
  p_provider_response text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cmd gate_open_commands;
begin
  if p_status not in ('sent', 'opened', 'failed', 'cancelled') then
    raise exception 'invalid command status' using errcode = '22023';
  end if;

  select * into cmd from gate_open_commands where id = p_command_id for update;
  if not found then
    raise exception 'command not found' using errcode = 'P0001';
  end if;
  if cmd.status not in ('pending', 'sent') then
    raise exception 'command already finalized' using errcode = '23514';
  end if;

  update gate_open_commands
     set status = p_status,
         provider_response = nullif(btrim(coalesce(p_provider_response, '')), ''),
         completed_at = case when p_status in ('opened', 'failed', 'cancelled') then now() else completed_at end
   where id = p_command_id;

  update gate_iot_devices
     set last_status = case
           when p_status = 'opened' then 'unlocked'
           when p_status = 'failed' then 'error'
           else last_status
         end,
         last_status_at = now()
   where id = cmd.device_id;
end;
$$;

revoke all on function complete_gate_open_command(uuid, text, text) from public;
grant execute on function complete_gate_open_command(uuid, text, text) to service_role;
