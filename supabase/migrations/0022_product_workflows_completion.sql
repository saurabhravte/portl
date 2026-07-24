-- 0022: Complete scheduled communications, amenity decisions and gate operations.

-- ── Due-time notice and poll delivery ────────────────────────────────────────
alter table notices add column if not exists notified_at timestamptz;
alter table polls add column if not exists notified_at timestamptz;
create table if not exists communication_dispatches (
  entity_type text not null check(entity_type in ('notice','poll')),
  entity_id uuid not null,
  dispatched_at timestamptz not null default now(),
  primary key(entity_type,entity_id)
);
alter table communication_dispatches enable row level security;

create or replace function workflow_target_profiles(
  p_society_id uuid, p_tower_ids uuid[], p_flat_ids uuid[]
) returns setof text
language sql stable security definer set search_path = public as $$
  select distinct p.id
  from profiles p
  left join flats f on f.id = p.flat_id
  where p.society_id = p_society_id
    and p.role = 'resident'
    and (
      cardinality(coalesce(p_tower_ids, '{}')) = 0
      and cardinality(coalesce(p_flat_ids, '{}')) = 0
      or p.flat_id = any(coalesce(p_flat_ids, '{}'))
      or f.tower_id = any(coalesce(p_tower_ids, '{}'))
    )
$$;

create or replace function process_due_communications(p_limit integer default 100)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  item record;
  recipient text;
  notice_count integer := 0;
  poll_count integer := 0;
begin
  for item in
    select * from notices
    where published_at is not null and published_at <= now()
      and (expires_at is null or expires_at > now())
      and not exists(select 1 from communication_dispatches d
        where d.entity_type='notice' and d.entity_id=notices.id)
    order by published_at for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  loop
    for recipient in select workflow_target_profiles(
      item.society_id, item.target_tower_ids, item.target_flat_ids
    ) loop
      insert into notifications(user_id, type, payload) values (
        recipient, 'notice', jsonb_build_object(
          'title', item.title, 'body', left(item.body, 180),
          'url', '/(resident)/notices', 'noticeId', item.id
        )
      );
    end loop;
    insert into communication_dispatches(entity_type,entity_id)
      values('notice',item.id) on conflict do nothing;
    update notices set notified_at = now() where id = item.id and notified_at is null;
    notice_count := notice_count + 1;
  end loop;

  for item in
    select * from polls
    where opens_at <= now() and closes_at > now()
      and closed_at is null
      and not exists(select 1 from communication_dispatches d
        where d.entity_type='poll' and d.entity_id=polls.id)
    order by opens_at for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  loop
    for recipient in select workflow_target_profiles(
      item.society_id, item.target_tower_ids, item.target_flat_ids
    ) loop
      insert into notifications(user_id, type, payload) values (
        recipient, 'poll', jsonb_build_object(
          'title', 'Poll now open', 'body', item.question,
          'url', '/(resident)/community', 'pollId', item.id
        )
      );
    end loop;
    insert into communication_dispatches(entity_type,entity_id)
      values('poll',item.id) on conflict do nothing;
    poll_count := poll_count + 1;
  end loop;
  return jsonb_build_object('notices', notice_count, 'polls', poll_count);
end $$;

create or replace function dispatch_due_communication() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'notices' then
    if new.published_at is not null and new.published_at <= now() then
      perform process_due_communications(100);
    end if;
  elsif tg_table_name = 'polls' and new.opens_at <= now() then
    perform process_due_communications(100);
  end if;
  return new;
end $$;
drop trigger if exists trg_dispatch_due_notice on notices;
create trigger trg_dispatch_due_notice after insert or update of published_at on notices
  for each row execute function dispatch_due_communication();
drop trigger if exists trg_dispatch_due_poll on polls;
create trigger trg_dispatch_due_poll after insert or update of opens_at on polls
  for each row execute function dispatch_due_communication();

create or replace function enforce_notice_lifecycle() returns trigger
language plpgsql set search_path=public as $$
declare caller_role text;
begin
  select role into caller_role from profiles where id=clerk_uid();
  if new.expires_at is not null and new.published_at is not null
     and new.expires_at<=new.published_at then
    raise exception 'notice expiry must follow publication' using errcode='23514';
  end if;
  if exists(
    select 1 from unnest(new.target_flat_ids) target_id
    where not exists(select 1 from flats f where f.id=target_id and f.society_id=new.society_id)
  ) or exists(
    select 1 from unnest(new.target_tower_ids) target_id
    where not exists(select 1 from towers t where t.id=target_id and t.society_id=new.society_id)
  ) then raise exception 'notice targets must belong to its society' using errcode='23514'; end if;
  if tg_op='INSERT' then
    if current_user='authenticated'
       and (new.created_by is distinct from clerk_uid() or caller_role<>'admin') then
      raise exception 'notice creator must be the caller' using errcode='42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.society_id is distinct from old.society_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'notice identity is immutable' using errcode='42501';
  end if;
  if old.published_at is not null and old.published_at<=now()
     and new.published_at is distinct from old.published_at then
    raise exception 'published notices cannot be unpublished or rescheduled' using errcode='23514';
  end if;
  if current_user='authenticated' and new.notified_at is distinct from old.notified_at then
    raise exception 'notice delivery state is server managed' using errcode='42501';
  end if;
  new.updated_at:=now();
  return new;
end $$;

-- Admins see drafts and scheduled rows; residents retain the published/targeted policy.
drop policy if exists notices_read on notices;
create policy notices_read on notices for select using (
  society_id = my_society() and (
    my_role() = 'admin'
    or (
      published_at is not null and published_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        cardinality(target_flat_ids) = 0 and cardinality(target_tower_ids) = 0
        or my_flat() = any(target_flat_ids)
        or exists (
          select 1 from flats f
          where f.id = my_flat() and f.tower_id = any(target_tower_ids)
        )
      )
    )
  )
);
drop policy if exists polls_read on polls;
create policy polls_read on polls for select using (
  society_id = my_society() and (
    my_role() = 'admin'
    or (
      opens_at <= now()
      and (
        cardinality(target_flat_ids) = 0 and cardinality(target_tower_ids) = 0
        or my_flat() = any(target_flat_ids)
        or exists (
          select 1 from flats f
          where f.id = my_flat() and f.tower_id = any(target_tower_ids)
        )
      )
    )
  )
);

create or replace function enforce_poll_vote_bounds() returns trigger
language plpgsql set search_path = public as $$
declare option_count integer;
begin
  select jsonb_array_length(options::jsonb) into option_count from polls where id = new.poll_id;
  if option_count is null or new.option_index < 0 or new.option_index >= option_count then
    raise exception 'poll option index is out of bounds' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists trg_poll_vote_bounds on poll_votes;
create trigger trg_poll_vote_bounds before insert or update on poll_votes
  for each row execute function enforce_poll_vote_bounds();

-- ── Private notice and poll attachments ─────────────────────────────────────
drop policy if exists society_media_read on storage.objects;
drop policy if exists society_media_insert on storage.objects;
drop policy if exists society_media_delete on storage.objects;
create policy society_media_read on storage.objects for select using (
  bucket_id = 'society-media'
  and array_length(string_to_array(name, '/'), 1) = 3
  and split_part(name, '/', 1) = my_society()::text
  and split_part(name, '/', 2) in ('visitors', 'tickets', 'notices', 'polls')
  and (
    my_role() = 'admin'
    or left(storage.filename(name), length(clerk_uid()) + 1) = clerk_uid() || '-'
    or exists (
      select 1 from notices n where split_part(name, '/', 2) = 'notices'
        and (name = any(n.attachments) or 'society-media:' || name = any(n.attachments))
        and n.society_id = my_society() and n.published_at <= now()
        and (n.expires_at is null or n.expires_at > now())
        and (
          cardinality(n.target_flat_ids) = 0 and cardinality(n.target_tower_ids) = 0
          or my_flat() = any(n.target_flat_ids)
          or exists(select 1 from flats f where f.id=my_flat() and f.tower_id=any(n.target_tower_ids))
        )
    )
    or exists (
      select 1 from polls p where split_part(name, '/', 2) = 'polls'
        and (name = any(p.attachments) or 'society-media:' || name = any(p.attachments))
        and p.society_id = my_society() and p.opens_at <= now()
        and (
          cardinality(p.target_flat_ids) = 0 and cardinality(p.target_tower_ids) = 0
          or my_flat() = any(p.target_flat_ids)
          or exists(select 1 from flats f where f.id=my_flat() and f.tower_id=any(p.target_tower_ids))
        )
    )
    or exists (
      select 1 from visitors v where split_part(name, '/', 2) = 'visitors'
        and v.society_id=my_society() and v.flat_id=my_flat()
        and v.photo_url in (name, 'society-media:' || name)
    )
    or exists (
      select 1 from tickets t join flats f on f.id=t.flat_id
      where split_part(name, '/', 2)='tickets' and t.flat_id=my_flat()
        and f.society_id=my_society()
        and (name=any(t.photos) or 'society-media:'||name=any(t.photos))
    )
  )
);
create policy society_media_insert on storage.objects for insert with check (
  bucket_id='society-media'
  and array_length(string_to_array(name,'/'),1)=3
  and split_part(name,'/',1)=my_society()::text
  and split_part(name,'/',2) in ('visitors','tickets','notices','polls')
  and left(storage.filename(name),length(clerk_uid())+1)=clerk_uid()||'-'
  and substring(storage.filename(name) from length(clerk_uid())+2) ~ '^[0-9]+[.]jpg$'
  and (
    split_part(name,'/',2)='visitors' and my_role() in ('guard','admin')
    or split_part(name,'/',2)='tickets' and my_role() in ('resident','admin')
    or split_part(name,'/',2) in ('notices','polls') and my_role()='admin'
  )
  and lower(coalesce(metadata->>'mimetype','')) in
    ('image/jpeg','image/png','image/webp','image/heic','image/heif')
  and case
    when coalesce(metadata->>'size',metadata->>'contentLength','') ~ '^[0-9]+$'
    then coalesce(metadata->>'size',metadata->>'contentLength')::bigint between 1 and 5242880
    else false
  end
);
create policy society_media_delete on storage.objects for delete using (
  bucket_id='society-media' and split_part(name,'/',1)=my_society()::text
  and (my_role()='admin'
    or left(storage.filename(name),length(clerk_uid())+1)=clerk_uid()||'-')
);

-- ── Amenity booking decisions and immutable history ─────────────────────────
alter table amenity_bookings
  add column if not exists decided_by text references profiles(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text;
create table if not exists amenity_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references amenity_bookings(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id text references profiles(id),
  reason text,
  created_at timestamptz not null default now()
);
alter table amenity_booking_events enable row level security;
create policy amenity_events_read on amenity_booking_events for select using (
  exists (
    select 1 from amenity_bookings b join amenities a on a.id=b.amenity_id
    where b.id=booking_id and a.society_id=my_society()
      and (my_role()='admin' or b.booked_by=clerk_uid())
  )
);
create or replace function prevent_immutable_event_change() returns trigger
language plpgsql set search_path=public as $$
begin
  raise exception 'audit events are immutable' using errcode='42501';
end $$;
drop trigger if exists trg_amenity_event_immutable on amenity_booking_events;
create trigger trg_amenity_event_immutable before update or delete on amenity_booking_events
  for each row execute function prevent_immutable_event_change();
drop policy if exists bookings_admin_all on amenity_bookings;
create policy bookings_admin_read on amenity_bookings for select using (
  my_role()='admin' and exists(
    select 1 from amenities a where a.id=amenity_id and a.society_id=my_society()
  )
);
create or replace function audit_amenity_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into amenity_booking_events(booking_id,from_status,to_status,actor_id,reason)
    values(new.id,case when tg_op='INSERT' then null else old.status end,new.status,
      clerk_uid(),new.decision_reason);
  end if;
  return new;
end $$;
drop trigger if exists trg_amenity_booking_audit on amenity_bookings;
create trigger trg_amenity_booking_audit after insert or update on amenity_bookings
  for each row execute function audit_amenity_booking();

create or replace function decide_amenity_booking(
  p_booking_id uuid, p_decision text, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller profiles; booking record;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role<>'admin' then raise exception 'admins only' using errcode='42501'; end if;
  if p_decision not in ('confirmed','rejected') then raise exception 'invalid decision' using errcode='22023'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'rejection reason is required' using errcode='22023';
  end if;
  select b.*,a.name into booking from amenity_bookings b join amenities a on a.id=b.amenity_id
   where b.id=p_booking_id and a.society_id=caller.society_id for update of b;
  if not found or booking.status<>'pending' then raise exception 'booking is no longer pending' using errcode='23514'; end if;
  update amenity_bookings set status=p_decision,decided_by=caller.id,decided_at=now(),
    decision_reason=nullif(trim(coalesce(p_reason,'')),'') where id=p_booking_id;
  insert into notifications(user_id,type,payload) values (
    booking.booked_by,'amenity_booking',jsonb_build_object(
      'title','Amenity booking '||case when p_decision='confirmed' then 'approved' else 'rejected' end,
      'body',booking.name||coalesce(': '||nullif(trim(coalesce(p_reason,'')),''),''),
      'url','/(resident)/community','bookingId',booking.id
    )
  );
  return jsonb_build_object('id',booking.id,'status',p_decision);
end $$;

-- ── Guard device context, inventory and revocation ──────────────────────────
alter table guard_device_sessions
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by text references profiles(id),
  add column if not exists revoke_reason text;
drop policy if exists guard_sessions_self on guard_device_sessions;
create policy guard_sessions_self_read on guard_device_sessions for select
  using(guard_id=clerk_uid());
create policy guard_sessions_admin_update on guard_device_sessions for update
  using(my_role()='admin' and society_id=my_society())
  with check(my_role()='admin' and society_id=my_society());

create or replace function register_guard_device(
  p_device_id text, p_device_name text default null, p_gate_id uuid default null,
  p_push_token text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare caller profiles; existing guard_device_sessions; result_id uuid;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role<>'guard' then raise exception 'guards only' using errcode='42501'; end if;
  if length(trim(coalesce(p_device_id,'')))<16 then raise exception 'invalid device id' using errcode='22023'; end if;
  if p_gate_id is not null and not exists(select 1 from gates where id=p_gate_id and society_id=caller.society_id and is_active)
    then raise exception 'invalid gate' using errcode='22023'; end if;
  select * into existing from guard_device_sessions
    where guard_id=caller.id and device_id=p_device_id for update;
  if found and existing.status='revoked' then
    raise exception 'this device session was revoked by an administrator' using errcode='42501';
  end if;
  insert into guard_device_sessions(society_id,guard_id,gate_id,device_id,device_name,push_token,status,last_seen_at)
  values(caller.society_id,caller.id,p_gate_id,p_device_id,nullif(trim(coalesce(p_device_name,'')),''),
    p_push_token,'active',now())
  on conflict(guard_id,device_id) do update set
    gate_id=excluded.gate_id,device_name=excluded.device_name,push_token=excluded.push_token,
    last_seen_at=now()
  returning id into result_id;
  return result_id;
end $$;
create or replace function heartbeat_guard_device(p_device_id text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update guard_device_sessions set last_seen_at=now()
    where guard_id=clerk_uid() and device_id=p_device_id and status='active';
  return found;
end $$;
create or replace function sign_out_guard_device(p_device_id text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update guard_device_sessions set status='signed_out',last_seen_at=now()
    where guard_id=clerk_uid() and device_id=p_device_id and status='active';
  return found;
end $$;
create or replace function revoke_guard_device(
  p_session_id uuid, p_reason text
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if my_role()<>'admin' or length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'admin and reason required' using errcode='42501';
  end if;
  update guard_device_sessions set status='revoked',revoked_at=now(),
    revoked_by=clerk_uid(),revoke_reason=trim(p_reason)
  where id=p_session_id and society_id=my_society() and status='active';
  return found;
end $$;
create or replace function assert_active_guard_device() returns trigger
language plpgsql security definer set search_path=public as $$
declare caller profiles; device_id text;
begin
  select * into caller from profiles where id=clerk_uid();
  if caller.role<>'guard' then return new; end if;
  device_id := coalesce(
    (nullif(current_setting('request.headers',true),'')::jsonb)->>'x-portl-device-id',''
  );
  if not exists(
    select 1 from guard_device_sessions s
    where s.guard_id=caller.id and s.society_id=caller.society_id
      and s.device_id=device_id and s.status='active'
      and s.last_seen_at > now()-interval '10 minutes'
  ) then raise exception 'an active guard device session is required' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists trg_gate_operation_device on gate_operations;
create trigger trg_gate_operation_device before insert on gate_operations
  for each row execute function assert_active_guard_device();
drop trigger if exists trg_gate_log_device on gate_logs;
create trigger trg_gate_log_device before insert or update on gate_logs
  for each row execute function assert_active_guard_device();

-- Immutable concrete record for every administrative override.
create table if not exists gate_audit_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  event_type text not null check(event_type='admin_override'),
  actor_id text not null references profiles(id),
  visitor_id uuid not null references visitors(id),
  gate_log_id uuid not null unique references gate_logs(id),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table gate_audit_events enable row level security;
create policy gate_audit_admin_read on gate_audit_events for select
  using(my_role()='admin' and society_id=my_society());
drop trigger if exists trg_gate_audit_immutable on gate_audit_events;
create trigger trg_gate_audit_immutable before update or delete on gate_audit_events
  for each row execute function prevent_immutable_event_change();
create or replace function audit_admin_override() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.method='admin_override' then
    insert into gate_audit_events(society_id,event_type,actor_id,visitor_id,gate_log_id,reason)
    select v.society_id,'admin_override',new.entry_guard_id,new.visitor_id,new.id,new.override_reason
    from visitors v where v.id=new.visitor_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_admin_override on gate_logs;
create trigger trg_audit_admin_override after insert on gate_logs
  for each row execute function audit_admin_override();

revoke all on function workflow_target_profiles(uuid,uuid[],uuid[]) from public;
revoke all on function process_due_communications(integer) from public;
revoke all on function decide_amenity_booking(uuid,text,text) from public;
revoke all on function register_guard_device(text,text,uuid,text) from public;
revoke all on function heartbeat_guard_device(text) from public;
revoke all on function sign_out_guard_device(text) from public;
revoke all on function revoke_guard_device(uuid,text) from public;
grant execute on function process_due_communications(integer) to service_role;
grant execute on function decide_amenity_booking(uuid,text,text) to authenticated;
grant execute on function register_guard_device(text,text,uuid,text) to authenticated;
grant execute on function heartbeat_guard_device(text) to authenticated;
grant execute on function sign_out_guard_device(text) to authenticated;
grant execute on function revoke_guard_device(uuid,text) to authenticated;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule(
      'portl-due-communications-v0022','* * * * *',
      'select public.process_due_communications(100);'
    );
  end if;
exception when others then
  raise notice 'Scheduled communication cron not installed: %', sqlerrm;
end $$;
