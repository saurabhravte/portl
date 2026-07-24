-- 0017: production workflow completion. Forward-only and compatible with
-- 0001-0015; 0016 is intentionally reserved for auth/session work.

-- ── Pre-approval lifecycle and audit ─────────────────────────────────
alter table pre_approvals
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by text references profiles(id),
  add column if not exists revoke_reason text;

alter table pre_approvals drop constraint if exists pre_approvals_revoke_fields;
alter table pre_approvals add constraint pre_approvals_revoke_fields check (
  (revoked_at is null and revoked_by is null)
  or (revoked_at is not null and revoked_by is not null)
);

create table if not exists pre_approval_events (
  id uuid primary key default gen_random_uuid(),
  pre_approval_id uuid not null references pre_approvals(id) on delete cascade,
  event text not null check (event in ('created', 'used', 'revoked')),
  actor_id text references profiles(id),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists pre_approval_events_pass_idx
  on pre_approval_events(pre_approval_id, created_at);
alter table pre_approval_events enable row level security;
create policy pre_events_read on pre_approval_events for select using (
  exists (
    select 1 from pre_approvals p
    join flats f on f.id = p.flat_id
    where p.id = pre_approval_id
      and f.society_id = my_society()
      and (my_role() in ('guard', 'admin') or p.flat_id = my_flat())
  )
);

create or replace function audit_pre_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into pre_approval_events(pre_approval_id, event, actor_id)
    values (new.id, 'created', new.created_by);
  elsif new.used_at is distinct from old.used_at and new.used_at is not null then
    insert into pre_approval_events(pre_approval_id, event, actor_id)
    values (new.id, 'used', clerk_uid());
  elsif new.revoked_at is distinct from old.revoked_at and new.revoked_at is not null then
    insert into pre_approval_events(pre_approval_id, event, actor_id, detail)
    values (new.id, 'revoked', new.revoked_by, new.revoke_reason);
  end if;
  return new;
end $$;
drop trigger if exists trg_pre_approval_audit on pre_approvals;
create trigger trg_pre_approval_audit
  after insert or update on pre_approvals
  for each row execute function audit_pre_approval();

create or replace function enforce_pre_approval_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.revoked_at is not null then
    raise exception 'revoked passes cannot be changed';
  end if;
  if new.used_at is not null and new.revoked_at is not null then
    raise exception 'revoked passes cannot be redeemed';
  end if;
  if new.revoked_at is not null and old.used_at is not null then
    raise exception 'used passes cannot be revoked';
  end if;
  return new;
end $$;
drop trigger if exists trg_pre_approval_lifecycle on pre_approvals;
create trigger trg_pre_approval_lifecycle before update on pre_approvals
  for each row execute function enforce_pre_approval_lifecycle();

create or replace function revoke_pre_approval(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update pre_approvals
     set revoked_at = now(), revoked_by = clerk_uid(),
         revoke_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_id and flat_id = my_flat() and created_by = clerk_uid()
     and used_at is null and revoked_at is null and valid_to > now();
  if not found then raise exception 'Pass is no longer active or cannot be revoked.'; end if;
end $$;
revoke all on function revoke_pre_approval(uuid, text) from public;
grant execute on function revoke_pre_approval(uuid, text) to authenticated;

-- ── Visitor request safeguards and occupancy ─────────────────────────
alter table gate_logs add column if not exists expected_exit_at timestamptz;
update gate_logs set expected_exit_at = entry_at + interval '4 hours'
 where expected_exit_at is null;
create or replace function set_expected_visitor_exit() returns trigger
language plpgsql set search_path = public as $$
begin
  new.expected_exit_at := coalesce(new.expected_exit_at, new.entry_at + interval '4 hours');
  return new;
end $$;
drop trigger if exists trg_expected_visitor_exit on gate_logs;
create trigger trg_expected_visitor_exit before insert on gate_logs
  for each row execute function set_expected_visitor_exit();
create unique index if not exists visitor_requests_one_pending_per_visitor
  on visitor_requests(visitor_id) where status='pending';
create or replace function prevent_duplicate_pending_request() returns trigger
language plpgsql set search_path = public as $$
declare incoming visitors;
begin
  if new.status<>'pending' then return new; end if;
  select * into incoming from visitors where id=new.visitor_id;
  perform pg_advisory_xact_lock(hashtextextended(incoming.flat_id::text, 0));
  if exists(
    select 1 from visitor_requests r join visitors v on v.id=r.visitor_id
     where r.status='pending' and r.created_at>now()-interval '5 minutes'
       and v.flat_id=incoming.flat_id and v.id<>incoming.id
       and (
         (nullif(regexp_replace(coalesce(incoming.phone,''),'\D','','g'),'') is not null
          and regexp_replace(coalesce(v.phone,''),'\D','','g')=
              regexp_replace(coalesce(incoming.phone,''),'\D','','g'))
         or lower(trim(v.name))=lower(trim(incoming.name))
       )
  ) then
    raise exception 'A matching visitor request is already pending.';
  end if;
  return new;
end $$;
drop trigger if exists trg_prevent_duplicate_pending_request on visitor_requests;
create trigger trg_prevent_duplicate_pending_request before insert on visitor_requests
  for each row execute function prevent_duplicate_pending_request();

create or replace function raise_visitor_request(
  p_flat_id uuid, p_name text, p_type text, p_phone text default null,
  p_vehicle_no text default null, p_photo_url text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller record; existing record; visitor_id uuid; request_id uuid;
begin
  select id, role, society_id into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('guard', 'admin') then
    raise exception 'only gate staff can raise visitor requests';
  end if;
  if p_type not in ('guest','delivery','cab','service') or length(trim(p_name)) < 2 then
    raise exception 'invalid visitor details';
  end if;
  if not exists(select 1 from flats where id = p_flat_id and society_id = caller.society_id) then
    raise exception 'flat not found in your society';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_flat_id::text, 0));

  select r.id, r.status into existing
    from visitor_requests r join visitors v on v.id = r.visitor_id
   where v.flat_id = p_flat_id and r.status = 'pending'
     and r.created_at > now() - interval '5 minutes'
     and (
       (nullif(regexp_replace(coalesce(p_phone,''), '\D','','g'),'') is not null
        and regexp_replace(coalesce(v.phone,''), '\D','','g') =
            regexp_replace(coalesce(p_phone,''), '\D','','g'))
       or lower(trim(v.name)) = lower(trim(p_name))
     )
   order by r.created_at desc limit 1;
  if found then
    return jsonb_build_object('requestId', existing.id, 'status', existing.status, 'duplicate', true);
  end if;

  insert into visitors(society_id, flat_id, type, name, phone, vehicle_no, photo_url)
  values(caller.society_id, p_flat_id, p_type, trim(p_name), nullif(trim(p_phone),''),
         nullif(trim(p_vehicle_no),''), nullif(trim(p_photo_url),''))
  returning id into visitor_id;
  insert into visitor_requests(visitor_id, raised_by)
  values(visitor_id, caller.id) returning id into request_id;
  return jsonb_build_object('requestId', request_id, 'status',
    (select status from visitor_requests where id = request_id), 'duplicate', false);
end $$;
revoke all on function raise_visitor_request(uuid,text,text,text,text,text) from public;
grant execute on function raise_visitor_request(uuid,text,text,text,text,text) to authenticated;

-- ── Helpdesk status history and explicit SLA ─────────────────────────
alter table tickets add column if not exists response_due_at timestamptz;
update tickets set response_due_at = created_at + interval '24 hours'
 where response_due_at is null;
alter table tickets alter column response_due_at set default (now() + interval '24 hours');

create table if not exists ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id text references profiles(id),
  assigned_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_status_history_ticket_idx
  on ticket_status_history(ticket_id, created_at);
alter table ticket_status_history enable row level security;
create policy ticket_history_read on ticket_status_history for select using (
  exists(select 1 from tickets t join flats f on f.id=t.flat_id
    where t.id=ticket_id and f.society_id=my_society()
      and (my_role()='admin' or t.flat_id=my_flat()))
);
create or replace function audit_ticket_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status
     or new.assigned_staff_id is distinct from old.assigned_staff_id then
    insert into ticket_status_history(
      ticket_id, from_status, to_status, actor_id, assigned_staff_id
    ) values (
      new.id, case when tg_op='INSERT' then null else old.status end,
      new.status, clerk_uid(), new.assigned_staff_id
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_ticket_audit on tickets;
create trigger trg_ticket_audit after insert or update on tickets
  for each row execute function audit_ticket_change();

-- ── Configurable amenities and server-side conflict rules ────────────
alter table amenities
  add column if not exists capacity int not null default 1 check (capacity > 0),
  add column if not exists price numeric(10,2) not null default 0 check (price >= 0),
  add column if not exists cancellation_cutoff_minutes int not null default 60
    check (cancellation_cutoff_minutes >= 0),
  add column if not exists requires_approval boolean not null default false,
  add column if not exists rules text,
  add column if not exists blackout_dates date[] not null default '{}';
alter table amenity_bookings drop constraint if exists amenity_bookings_status_check;
alter table amenity_bookings add constraint amenity_bookings_status_check
  check (status in ('pending','confirmed','cancelled','rejected'));
alter table amenity_bookings
  drop constraint if exists amenity_bookings_amenity_id_tstzrange_excl;
drop policy if exists bookings_resident_insert on amenity_bookings;
drop policy if exists bookings_resident_update on amenity_bookings;
create policy bookings_admin_all on amenity_bookings for all using (
  my_role()='admin' and exists(select 1 from amenities a
    where a.id=amenity_id and a.society_id=my_society())
) with check (
  exists(select 1 from amenities a
    where a.id=amenity_id and a.society_id=my_society())
);

create or replace function book_amenity(
  p_amenity_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare a amenities; booking_id uuid; overlap_count int;
begin
  if my_role() <> 'resident' or my_flat() is null then raise exception 'residents only'; end if;
  select * into a from amenities where id=p_amenity_id and society_id=my_society()
    and is_active for update;
  if not found then raise exception 'amenity unavailable'; end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then raise exception 'invalid booking time'; end if;
  if p_starts_at::date = any(a.blackout_dates) then raise exception 'amenity is blacked out on this date'; end if;
  if p_starts_at::time < a.open_time or p_ends_at::time > a.close_time
     or extract(epoch from (p_ends_at-p_starts_at))/60 <> a.slot_minutes then
    raise exception 'booking must match an available slot';
  end if;
  select count(*) into overlap_count from amenity_bookings
   where amenity_id=a.id and status in ('pending','confirmed')
     and tstzrange(starts_at,ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)');
  if overlap_count >= a.capacity then raise exception 'slot is full'; end if;
  insert into amenity_bookings(amenity_id,flat_id,booked_by,starts_at,ends_at,status)
  values(a.id,my_flat(),clerk_uid(),p_starts_at,p_ends_at,
    case when a.requires_approval then 'pending' else 'confirmed' end)
  returning id into booking_id;
  return booking_id;
end $$;
revoke all on function book_amenity(uuid,timestamptz,timestamptz) from public;
grant execute on function book_amenity(uuid,timestamptz,timestamptz) to authenticated;

create or replace function cancel_my_amenity_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select ab.*, a.cancellation_cutoff_minutes into b
    from amenity_bookings ab join amenities a on a.id=ab.amenity_id
   where ab.id=p_booking_id and ab.booked_by=clerk_uid() for update;
  if not found or b.status not in ('pending','confirmed') then raise exception 'booking cannot be cancelled'; end if;
  if now() > b.starts_at - make_interval(mins => b.cancellation_cutoff_minutes) then
    raise exception 'cancellation window has closed';
  end if;
  update amenity_bookings set status='cancelled' where id=p_booking_id;
end $$;
revoke all on function cancel_my_amenity_booking(uuid) from public;
grant execute on function cancel_my_amenity_booking(uuid) to authenticated;

-- ── Notices: scheduling, targeting, attachments, receipts ────────────
alter table notices
  add column if not exists idempotency_key uuid default gen_random_uuid(),
  add column if not exists attachments text[] not null default '{}',
  add column if not exists target_tower_ids uuid[] not null default '{}',
  add column if not exists target_flat_ids uuid[] not null default '{}',
  add column if not exists created_by text references profiles(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
update notices set attachments = array[attachment_url]
 where attachment_url is not null and cardinality(attachments)=0;
create unique index if not exists notices_idempotency_idx on notices(idempotency_key);

create table if not exists notice_reads (
  notice_id uuid not null references notices(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(notice_id, profile_id)
);
alter table notice_reads enable row level security;
create policy notice_reads_self on notice_reads for all
  using(profile_id=clerk_uid()) with check(profile_id=clerk_uid());
create policy notice_reads_admin on notice_reads for select using (
  my_role()='admin' and exists(select 1 from notices n
    where n.id=notice_id and n.society_id=my_society())
);

drop policy if exists notices_read on notices;
create policy notices_read on notices for select using (
  society_id=my_society() and published_at <= now()
  and (expires_at is null or expires_at > now())
  and (
    audience='all'
    or cardinality(target_flat_ids)=0 and cardinality(target_tower_ids)=0
    or my_flat()=any(target_flat_ids)
    or exists(select 1 from flats f where f.id=my_flat() and f.tower_id=any(target_tower_ids))
    or my_role()='admin'
  )
);

-- ── Poll scheduling, targeting, close and quorum ─────────────────────
alter table polls
  add column if not exists opens_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by text references profiles(id),
  add column if not exists quorum_percent int not null default 0
    check (quorum_percent between 0 and 100),
  add column if not exists target_tower_ids uuid[] not null default '{}',
  add column if not exists target_flat_ids uuid[] not null default '{}',
  add column if not exists attachments text[] not null default '{}';
drop policy if exists polls_read on polls;
create policy polls_read on polls for select using (
  society_id=my_society() and opens_at<=now()
  and (
    cardinality(target_flat_ids)=0 and cardinality(target_tower_ids)=0
    or my_flat()=any(target_flat_ids)
    or exists(select 1 from flats f where f.id=my_flat() and f.tower_id=any(target_tower_ids))
    or my_role()='admin'
  )
);
drop policy if exists votes_insert on poll_votes;
create policy votes_insert on poll_votes for insert with check (
  voter_id=clerk_uid() and my_role()='resident' and flat_id=my_flat()
  and exists(select 1 from polls p where p.id=poll_id
    and p.society_id=my_society() and p.opens_at<=now()
    and p.closes_at>now() and p.closed_at is null)
);

-- ── Service providers are not society staff ──────────────────────────
create table if not exists service_providers (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  name text not null,
  category text not null,
  phone text,
  photo_url text,
  description text,
  is_verified boolean not null default false,
  is_available boolean not null default true,
  availability_text text,
  created_at timestamptz not null default now()
);
create index if not exists service_providers_search_idx
  on service_providers(society_id, category, is_available);
alter table service_providers enable row level security;
create policy service_providers_read on service_providers for select
  using(society_id=my_society());
create policy service_providers_admin on service_providers for all
  using(my_role()='admin' and society_id=my_society())
  with check(society_id=my_society());

-- ── Guard roster, assignments, shifts and device sessions ────────────
create table if not exists gates (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  unique(society_id,name)
);
create table if not exists guard_shifts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  guard_id text not null references profiles(id) on delete cascade,
  gate_id uuid references gates(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check(status in ('scheduled','checked_in','completed','missed','cancelled')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create table if not exists guard_device_sessions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  guard_id text not null references profiles(id) on delete cascade,
  gate_id uuid references gates(id) on delete set null,
  device_id text not null,
  device_name text,
  push_token text,
  status text not null default 'active' check(status in ('active','revoked','signed_out')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(guard_id,device_id)
);
alter table gates enable row level security;
alter table guard_shifts enable row level security;
alter table guard_device_sessions enable row level security;
create policy gates_society_read on gates for select using(society_id=my_society());
create policy gates_admin on gates for all using(my_role()='admin' and society_id=my_society())
  with check(society_id=my_society());
create policy guard_shifts_read on guard_shifts for select using(
  society_id=my_society() and (my_role()='admin' or guard_id=clerk_uid())
);
create policy guard_shifts_admin on guard_shifts for all
  using(my_role()='admin' and society_id=my_society()) with check(society_id=my_society());
create policy guard_sessions_self on guard_device_sessions for all
  using(guard_id=clerk_uid()) with check(
    guard_id=clerk_uid() and society_id=my_society() and my_role()='guard'
  );
create policy guard_sessions_admin on guard_device_sessions for select
  using(my_role()='admin' and society_id=my_society());

create or replace function update_my_guard_shift_status(
  p_shift_id uuid, p_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare current_shift guard_shifts;
begin
  if my_role()<>'guard' or p_status not in ('checked_in','completed') then
    raise exception 'invalid guard shift update';
  end if;
  select * into current_shift from guard_shifts
   where id=p_shift_id and guard_id=clerk_uid() and society_id=my_society()
   for update;
  if not found then raise exception 'shift not found'; end if;
  if p_status='checked_in' and current_shift.status<>'scheduled' then
    raise exception 'shift cannot be checked in';
  end if;
  if p_status='completed' and current_shift.status<>'checked_in' then
    raise exception 'shift must be checked in first';
  end if;
  update guard_shifts set status=p_status,
    checked_in_at=case when p_status='checked_in' then now() else checked_in_at end,
    checked_out_at=case when p_status='completed' then now() else checked_out_at end
   where id=p_shift_id;
end $$;
revoke all on function update_my_guard_shift_status(uuid,text) from public;
grant execute on function update_my_guard_shift_status(uuid,text) to authenticated;

revoke all on function audit_pre_approval() from public;
revoke all on function audit_ticket_change() from public;
revoke all on function enforce_pre_approval_lifecycle() from public;
revoke all on function set_expected_visitor_exit() from public;
revoke all on function prevent_duplicate_pending_request() from public;
