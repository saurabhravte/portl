-- 0034_admin_society_batch.sql
-- Features #76 staff attendance, #77 admin capability grants, #78 document vault.

-- ═══════════════════════════════════════════════════════════════════════════
-- #76 Society staff attendance (directory staff, not guard_shifts)
-- ═══════════════════════════════════════════════════════════════════════════

alter table staff
  add column if not exists checkin_code text;

do $$
declare
  r record;
  code text;
  i int;
begin
  for r in select id from staff where checkin_code is null loop
    for i in 1..30 loop
      code := 'S' || lpad((floor(random() * 1000000))::bigint::text, 6, '0');
      exit when not exists (select 1 from staff where checkin_code = code);
    end loop;
    update staff set checkin_code = code where id = r.id;
  end loop;
end $$;

alter table staff
  alter column checkin_code set default '';
alter table staff
  alter column checkin_code set not null;

create unique index if not exists staff_society_checkin_code_uidx
  on staff (society_id, checkin_code);

create or replace function generate_staff_checkin_code()
returns text
language plpgsql
as $$
declare
  v_code text;
  i int;
begin
  for i in 1..20 loop
    v_code := 'S' || lpad((floor(random() * 1000000))::bigint::text, 6, '0');
    exit when not exists (select 1 from staff where checkin_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function staff_assign_checkin_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.checkin_code is null or btrim(new.checkin_code) = '' then
    new.checkin_code := generate_staff_checkin_code();
  end if;
  new.checkin_code := upper(btrim(new.checkin_code));
  return new;
end;
$$;
drop trigger if exists trg_staff_checkin_code on staff;
create trigger trg_staff_checkin_code
  before insert on staff
  for each row execute function staff_assign_checkin_code();

create table if not exists staff_attendance (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  checked_in_by text references profiles(id) on delete set null,
  checked_out_by text references profiles(id) on delete set null,
  method text not null default 'manual'
    check (method in ('manual', 'qr', 'code')),
  created_at timestamptz not null default now()
);
create index if not exists staff_attendance_staff_day_idx
  on staff_attendance (staff_id, checked_in_at desc);
create index if not exists staff_attendance_open_idx
  on staff_attendance (society_id, checked_out_at)
  where checked_out_at is null;
alter table staff_attendance enable row level security;
create policy staff_attendance_society_read on staff_attendance for select
  using (society_id = my_society());
create policy staff_attendance_no_direct_insert on staff_attendance
  for insert with check (false);
create policy staff_attendance_no_direct_update on staff_attendance
  for update using (false);

create or replace function check_in_staff(
  p_code text default null,
  p_staff_id uuid default null,
  p_method text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  member staff;
  open_log staff_attendance;
  log_id uuid;
  normalized text;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if caller.role not in ('guard', 'admin') then
    raise exception 'guards or admins only' using errcode = '42501';
  end if;
  if p_method not in ('manual', 'qr', 'code') then
    p_method := 'manual';
  end if;

  if p_staff_id is not null then
    select * into member
    from staff
    where id = p_staff_id
      and society_id = caller.society_id
      and is_active;
  else
    normalized := upper(btrim(coalesce(p_code, '')));
    if normalized ~ 'S[0-9]{6}' then
      normalized := substring(normalized from 'S[0-9]{6}');
    end if;
    select * into member
    from staff
    where society_id = caller.society_id
      and checkin_code = normalized
      and is_active;
  end if;

  if not found then
    raise exception 'staff not found' using errcode = 'P0001';
  end if;

  select * into open_log
  from staff_attendance
  where staff_id = member.id and checked_out_at is null
  order by checked_in_at desc limit 1;
  if found then
    return jsonb_build_object(
      'ok', true,
      'alreadyIn', true,
      'attendanceId', open_log.id,
      'staffName', member.name,
      'category', member.category
    );
  end if;

  insert into staff_attendance (society_id, staff_id, checked_in_by, method)
  values (member.society_id, member.id, caller.id, p_method)
  returning id into log_id;

  return jsonb_build_object(
    'ok', true,
    'alreadyIn', false,
    'attendanceId', log_id,
    'staffName', member.name,
    'category', member.category
  );
end;
$$;
revoke all on function check_in_staff(text, uuid, text) from public;
grant execute on function check_in_staff(text, uuid, text) to authenticated;

create or replace function check_out_staff(p_attendance_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  log staff_attendance;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found then raise exception 'not signed in' using errcode = '28000'; end if;
  if caller.role not in ('guard', 'admin') then
    raise exception 'guards or admins only' using errcode = '42501';
  end if;

  select * into log from staff_attendance where id = p_attendance_id for update;
  if not found or log.society_id <> caller.society_id then
    raise exception 'attendance not found' using errcode = '42501';
  end if;
  if log.checked_out_at is not null then
    raise exception 'already checked out' using errcode = '23514';
  end if;

  update staff_attendance
     set checked_out_at = now(), checked_out_by = caller.id
   where id = p_attendance_id;
end;
$$;
revoke all on function check_out_staff(uuid) from public;
grant execute on function check_out_staff(uuid) to authenticated;

create or replace function society_staff_on_duty()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(row order by row->>'staff_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'attendance_id', a.id,
      'staff_id', s.id,
      'staff_name', s.name,
      'category', s.category,
      'checked_in_at', a.checked_in_at,
      'method', a.method
    ) as row
    from staff_attendance a
    join staff s on s.id = a.staff_id
    where a.society_id = my_society()
      and a.checked_out_at is null
      and s.is_active
    order by a.checked_in_at desc
    limit 200
  ) rows;
$$;
revoke all on function society_staff_on_duty() from public;
grant execute on function society_staff_on_duty() to authenticated;

create or replace function society_staff_attendance_summary(
  p_from timestamptz default (now() - interval '24 hours'),
  p_to timestamptz default (now() + interval '1 hour')
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if my_role() <> 'admin' then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'checked_in_open', count(*) filter (where checked_out_at is null),
      'sessions', count(*),
      'from', p_from,
      'to', p_to
    )
    from staff_attendance
    where society_id = my_society()
      and checked_in_at < p_to
      and (checked_out_at is null or checked_out_at > p_from)
  );
end;
$$;
revoke all on function society_staff_attendance_summary(timestamptz, timestamptz) from public;
grant execute on function society_staff_attendance_summary(timestamptz, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- #77 Admin capability grants (overlay; empty = full admin)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists admin_capabilities (
  society_id uuid not null references societies(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  capability text not null
    check (capability in (
      'manage_society',
      'manage_members',
      'manage_gates',
      'manage_community',
      'manage_dues',
      'manage_documents',
      'view_audit'
    )),
  granted_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (society_id, profile_id, capability)
);
create index if not exists admin_capabilities_profile_idx
  on admin_capabilities (profile_id);
alter table admin_capabilities enable row level security;
create policy admin_capabilities_admin_read on admin_capabilities for select
  using (society_id = my_society() and my_role() = 'admin');
create policy admin_capabilities_no_direct_write on admin_capabilities
  for all using (false) with check (false);

create or replace function has_admin_capability(p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sid uuid;
  uid text;
  restricted boolean;
begin
  if my_role() is distinct from 'admin' then
    return false;
  end if;
  sid := my_society();
  uid := clerk_uid();
  if sid is null or uid is null then
    return false;
  end if;

  select exists (
    select 1 from admin_capabilities c
    where c.society_id = sid and c.profile_id = uid
  ) into restricted;

  -- No grants recorded → full admin (backward compatible).
  if not restricted then
    return true;
  end if;

  return exists (
    select 1 from admin_capabilities c
    where c.society_id = sid
      and c.profile_id = uid
      and c.capability = p_capability
  );
end;
$$;
revoke all on function has_admin_capability(text) from public;
grant execute on function has_admin_capability(text) to authenticated;

create or replace function my_admin_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when my_role() is distinct from 'admin' then '[]'::jsonb
    when not exists (
      select 1 from admin_capabilities
      where society_id = my_society() and profile_id = clerk_uid()
    ) then '["*"]'::jsonb
    else coalesce((
      select jsonb_agg(capability order by capability)
      from admin_capabilities
      where society_id = my_society() and profile_id = clerk_uid()
    ), '[]'::jsonb)
  end;
$$;
revoke all on function my_admin_capabilities() from public;
grant execute on function my_admin_capabilities() to authenticated;

create or replace function set_admin_capabilities(
  p_profile_id text,
  p_capabilities text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target profiles;
  cap text;
  allowed text[] := array[
    'manage_society','manage_members','manage_gates','manage_community',
    'manage_dues','manage_documents','view_audit'
  ];
begin
  if my_role() <> 'admin' or not has_admin_capability('manage_members') then
    raise exception 'manage_members capability required' using errcode = '42501';
  end if;

  select * into target
  from profiles
  where id = p_profile_id and society_id = my_society();
  if not found then
    raise exception 'member not found' using errcode = 'P0001';
  end if;
  if target.role <> 'admin' then
    raise exception 'capabilities only apply to admins' using errcode = '22023';
  end if;
  if target.id = clerk_uid() then
    raise exception 'cannot edit your own capability grants' using errcode = '42501';
  end if;

  foreach cap in array coalesce(p_capabilities, '{}') loop
    if not (cap = any(allowed)) then
      raise exception 'unknown capability: %', cap using errcode = '22023';
    end if;
  end loop;

  delete from admin_capabilities
   where society_id = my_society() and profile_id = p_profile_id;

  -- Empty array = restore full admin (no restriction rows).
  if coalesce(cardinality(p_capabilities), 0) > 0 then
    insert into admin_capabilities (society_id, profile_id, capability, granted_by)
    select my_society(), p_profile_id, unnest(p_capabilities), clerk_uid();
  end if;
end;
$$;
revoke all on function set_admin_capabilities(text, text[]) from public;
grant execute on function set_admin_capabilities(text, text[]) to authenticated;

create or replace function list_admin_capability_grants()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when my_role() <> 'admin' or not has_admin_capability('manage_members')
      then '[]'::jsonb
    else coalesce((
      select jsonb_agg(row order by row->>'name')
      from (
        select jsonb_build_object(
          'profile_id', p.id,
          'name', p.name,
          'capabilities', coalesce((
            select jsonb_agg(c.capability order by c.capability)
            from admin_capabilities c
            where c.society_id = p.society_id and c.profile_id = p.id
          ), '["*"]'::jsonb)
        ) as row
        from profiles p
        where p.society_id = my_society() and p.role = 'admin'
      ) rows
    ), '[]'::jsonb)
  end;
$$;
revoke all on function list_admin_capability_grants() from public;
grant execute on function list_admin_capability_grants() to authenticated;

-- Gate high-risk dues RPCs.
create or replace function raise_dues_for_all_flats(p_period text, p_amount numeric)
returns integer
language plpgsql security definer set search_path=public as $$
declare
  caller profiles;
  affected integer;
  cfg jsonb;
  due_day int;
  due_date date;
begin
  select * into caller from profiles where id=clerk_uid();
  if caller.role is distinct from 'admin' then
    raise exception 'admins only' using errcode='42501';
  end if;
  if not has_admin_capability('manage_dues') then
    raise exception 'manage_dues capability required' using errcode='42501';
  end if;
  if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_amount<=0 then
    raise exception 'invalid period or amount' using errcode='22023';
  end if;

  cfg := society_late_fee_config(caller.society_id);
  due_day := coalesce((cfg->>'dueDay')::int, 10);
  due_date := make_date(
    substring(p_period from 1 for 4)::int,
    substring(p_period from 6 for 2)::int,
    due_day
  );

  insert into maintenance_dues(society_id,flat_id,period,amount,due_on)
    select caller.society_id,f.id,p_period,p_amount,due_date
    from flats f where f.society_id=caller.society_id
    on conflict(flat_id,period) do nothing;
  get diagnostics affected=row_count;
  return affected;
end $$;

create or replace function waive_due_late_fee(p_due_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  if my_role() <> 'admin' or not has_admin_capability('manage_dues') then
    raise exception 'manage_dues capability required' using errcode = '42501';
  end if;
  update maintenance_dues
     set late_fee_waived_at = now()
   where id = p_due_id
     and society_id = my_society()
     and late_fee_waived_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'due not found or already waived' using errcode = 'P0002';
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- #78 Document vault
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists society_documents (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  title text not null,
  category text not null default 'general'
    check (category in ('general', 'bylaws', 'minutes', 'circular', 'form', 'other')),
  description text,
  storage_ref text not null,
  file_name text,
  mime_type text,
  visibility text not null default 'society'
    check (visibility in ('society', 'admins')),
  uploaded_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists society_documents_society_idx
  on society_documents (society_id, created_at desc);
alter table society_documents enable row level security;

create policy society_documents_read on society_documents for select
  using (
    society_id = my_society()
    and archived_at is null
    and (
      my_role() = 'admin'
      or (visibility = 'society' and my_role() in ('resident', 'guard', 'admin'))
    )
  );
create policy society_documents_admin_insert on society_documents for insert
  with check (
    society_id = my_society()
    and my_role() = 'admin'
    and uploaded_by = clerk_uid()
  );
create policy society_documents_admin_update on society_documents for update
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');
create policy society_documents_admin_delete on society_documents for delete
  using (society_id = my_society() and my_role() = 'admin');

-- Table privileges are checked before RLS; storage.objects policies also
-- subquery this table when evaluating society-media reads.
grant select, insert, update, delete on society_documents to authenticated;

-- Storage: allow documents folder (pdf + images) alongside existing photo folders.
-- Qualify storage.objects.name inside nested visitor/document queries. Without
-- qualification, PostgreSQL binds "name" to visitors.name and linked media is
-- incorrectly hidden (see 0024_runtime_fixes.sql).
drop policy if exists society_media_read on storage.objects;
drop policy if exists society_media_insert on storage.objects;
drop policy if exists society_media_delete on storage.objects;

create policy society_media_read on storage.objects for select using (
  bucket_id = 'society-media'
  and array_length(string_to_array(storage.objects.name, '/'), 1) = 3
  and split_part(storage.objects.name, '/', 1) = my_society()::text
  and split_part(storage.objects.name, '/', 2) in ('visitors', 'tickets', 'notices', 'polls', 'documents')
  and (
    my_role() = 'admin'
    or left(storage.filename(storage.objects.name), length(clerk_uid()) + 1) = clerk_uid() || '-'
    or (
      split_part(storage.objects.name, '/', 2) = 'documents'
      and exists (
        select 1 from society_documents d
        where d.society_id = my_society()
          and d.archived_at is null
          and d.visibility = 'society'
          and (
            d.storage_ref = storage.objects.name
            or d.storage_ref = 'society-media:' || storage.objects.name
          )
      )
    )
    or exists (
      select 1 from notices n
      where split_part(storage.objects.name, '/', 2) = 'notices'
        and (
          storage.objects.name = any(n.attachments)
          or 'society-media:' || storage.objects.name = any(n.attachments)
        )
        and n.society_id = my_society() and n.published_at <= now()
        and (n.expires_at is null or n.expires_at > now())
        and (
          cardinality(n.target_flat_ids) = 0 and cardinality(n.target_tower_ids) = 0
          or my_flat() = any(n.target_flat_ids)
          or exists(select 1 from flats f where f.id=my_flat() and f.tower_id=any(n.target_tower_ids))
        )
    )
    or exists (
      select 1 from polls p
      where split_part(storage.objects.name, '/', 2) = 'polls'
        and (
          storage.objects.name = any(p.attachments)
          or 'society-media:' || storage.objects.name = any(p.attachments)
        )
        and p.society_id = my_society() and p.opens_at <= now()
        and (
          cardinality(p.target_flat_ids) = 0 and cardinality(p.target_tower_ids) = 0
          or my_flat() = any(p.target_flat_ids)
          or exists(select 1 from flats f where f.id=my_flat() and f.tower_id=any(p.target_tower_ids))
        )
    )
    or exists (
      select 1 from visitors v
      where split_part(storage.objects.name, '/', 2) = 'visitors'
        and v.society_id=my_society() and v.flat_id=my_flat()
        and v.photo_url in (
          storage.objects.name,
          'society-media:' || storage.objects.name
        )
    )
    or exists (
      select 1 from tickets t join flats f on f.id=t.flat_id
      where split_part(storage.objects.name, '/', 2)='tickets'
        and t.flat_id=my_flat()
        and f.society_id=my_society()
        and (
          storage.objects.name=any(t.photos)
          or 'society-media:'||storage.objects.name=any(t.photos)
        )
    )
  )
);

create policy society_media_insert on storage.objects for insert with check (
  bucket_id='society-media'
  and array_length(string_to_array(storage.objects.name,'/'),1)=3
  and split_part(storage.objects.name,'/',1)=my_society()::text
  and left(storage.filename(storage.objects.name),length(clerk_uid())+1)=clerk_uid()||'-'
  and (
    (
      split_part(storage.objects.name,'/',2) in ('visitors','tickets','notices','polls')
      and substring(storage.filename(storage.objects.name) from length(clerk_uid())+2) ~ '^[0-9]+[.]jpg$'
      and (
        split_part(storage.objects.name,'/',2)='visitors' and my_role() in ('guard','admin')
        or split_part(storage.objects.name,'/',2)='tickets' and my_role() in ('resident','admin')
        or split_part(storage.objects.name,'/',2) in ('notices','polls') and my_role()='admin'
      )
      and lower(coalesce(metadata->>'mimetype','')) in
        ('image/jpeg','image/png','image/webp','image/heic','image/heif')
      and case
        when coalesce(metadata->>'size',metadata->>'contentLength','') ~ '^[0-9]+$'
        then coalesce(metadata->>'size',metadata->>'contentLength')::bigint between 1 and 5242880
        else false
      end
    )
    or (
      split_part(storage.objects.name,'/',2)='documents'
      and my_role()='admin'
      and substring(storage.filename(storage.objects.name) from length(clerk_uid())+2)
        ~ '^[0-9]+[.](jpg|jpeg|png|webp|pdf)$'
      and lower(coalesce(metadata->>'mimetype','')) in
        ('image/jpeg','image/png','image/webp','application/pdf')
      and case
        when coalesce(metadata->>'size',metadata->>'contentLength','') ~ '^[0-9]+$'
        then coalesce(metadata->>'size',metadata->>'contentLength')::bigint between 1 and 15728640
        else false
      end
    )
  )
);

create policy society_media_delete on storage.objects for delete using (
  bucket_id='society-media'
  and split_part(storage.objects.name,'/',1)=my_society()::text
  and (
    my_role()='admin'
    or left(storage.filename(storage.objects.name),length(clerk_uid())+1)=clerk_uid()||'-'
  )
);

create or replace function apply_maintenance_late_fees(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  due_row maintenance_dues;
  cfg jsonb;
  grace int;
  fee numeric;
  applied int := 0;
  skipped int := 0;
  bounded int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  society_filter uuid := null;
begin
  if clerk_uid() is not null then
    if my_role() <> 'admin' or not has_admin_capability('manage_dues') then
      raise exception 'manage_dues capability required' using errcode = '42501';
    end if;
    society_filter := my_society();
  end if;

  for due_row in
    select d.*
    from maintenance_dues d
    where d.status in ('due', 'claimed')
      and d.late_fee_applied_at is null
      and d.late_fee_waived_at is null
      and d.due_on is not null
      and (society_filter is null or d.society_id = society_filter)
    order by d.due_on, d.id
    for update skip locked
    limit bounded
  loop
    cfg := society_late_fee_config(due_row.society_id);
    if coalesce((cfg->>'enabled')::boolean, false) is not true then
      skipped := skipped + 1;
      continue;
    end if;
    grace := coalesce((cfg->>'graceDays')::int, 0);
    if due_row.due_on + grace >= current_date then
      skipped := skipped + 1;
      continue;
    end if;

    fee := coalesce((cfg->>'flatAmount')::numeric, 0);
    if coalesce((cfg->>'percent')::numeric, 0) > 0 then
      fee := fee + round(due_row.amount * (cfg->>'percent')::numeric / 100.0, 2);
    end if;
    if fee <= 0 then
      skipped := skipped + 1;
      continue;
    end if;

    update maintenance_dues
       set late_fee_amount = fee,
           late_fee_applied_at = now()
     where id = due_row.id;

    perform notify_flat_residents(
      due_row.flat_id,
      'dues',
      jsonb_build_object(
        'title', 'Late fee applied',
        'body', 'A late fee of ₹' || trim(to_char(fee, '999999990.99'))
                || ' was added to your ' || due_row.period || ' maintenance due.',
        'url', '/(resident)/payments',
        'due_id', due_row.id
      )
    );
    applied := applied + 1;
  end loop;

  return jsonb_build_object('applied', applied, 'skipped', skipped);
end;
$$;

create or replace function enforce_document_capability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if my_role() = 'admin' and not has_admin_capability('manage_documents') then
    raise exception 'manage_documents capability required' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_document_capability on society_documents;
create trigger trg_document_capability
  before insert or update or delete on society_documents
  for each row execute function enforce_document_capability();

-- Include check-in codes in admin staff dataset rows.
create or replace function admin_dataset_page(
  p_dataset text,
  p_limit integer default 25,
  p_after jsonb default null,
  p_search text default null,
  p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  caller profiles;
  source_sql text;
  row_sql text;
  search_sql text;
  filter_sql text := '';
  sort_sql text;
  direction_sql text;
  statement text;
  result jsonb;
  bounded_limit integer := least(greatest(coalesce(p_limit,25),1),100);
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role <> 'admin' then
    raise exception 'admins only' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb)) <> 'object' then
    raise exception 'filters must be an object' using errcode='22023';
  end if;

  case p_dataset
    when 'towers' then
      source_sql := 'towers t left join lateral (select count(*)::int count from flats f where f.tower_id=t.id) fc on true';
      row_sql := 'jsonb_build_object(''id'',t.id,''name'',t.name,''flat_count'',fc.count)';
      search_sql := 't.name ilike ''%''||$1||''%''';
      sort_sql := 'encode(convert_to(lower(t.name),''UTF8''),''hex'')';
      direction_sql := 'asc';
    when 'flats' then
      source_sql := 'flats f join towers t on t.id=f.tower_id';
      row_sql := 'jsonb_build_object(''id'',f.id,''number'',f.number,''occupancy_status'',f.occupancy_status,''tower'',jsonb_build_object(''id'',t.id,''name'',t.name))';
      search_sql := '(f.number ilike ''%''||$1||''%'' or t.name ilike ''%''||$1||''%'')';
      sort_sql := 'encode(convert_to(lower(t.name),''UTF8''),''hex'')||'':''||encode(convert_to(lower(f.number),''UTF8''),''hex'')';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''tower_id'' is null or f.tower_id::text=$2->>''tower_id'')'
        || ' and ($2->>''occupancy_status'' is null or f.occupancy_status=$2->>''occupancy_status'')';
    when 'profiles' then
      source_sql := 'profiles p left join flats f on f.id=p.flat_id left join towers t on t.id=f.tower_id';
      row_sql := 'jsonb_build_object(''id'',p.id,''name'',p.name,''role'',p.role,''phone'',p.phone,''flat'',case when f.id is null then null else jsonb_build_object(''id'',f.id,''number'',f.number,''tower_name'',t.name) end)';
      search_sql := '(p.name ilike ''%''||$1||''%'' or coalesce(p.phone,'''') ilike ''%''||$1||''%'' or coalesce(f.number,'''') ilike ''%''||$1||''%'')';
      sort_sql := 'encode(convert_to(lower(p.name),''UTF8''),''hex'')';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''role'' is null or p.role=$2->>''role'')';
    when 'invites' then
      source_sql := 'invites i left join flats f on f.id=i.flat_id';
      row_sql := 'jsonb_build_object(''id'',i.id,''identity_type'',coalesce(i.identity_type,case when i.email is null then ''phone'' else ''email'' end),''identity_value'',coalesce(i.identity_value,i.email,i.phone),''name'',i.name,''role'',i.role,''flat'',case when f.id is null then null else jsonb_build_object(''id'',f.id,''number'',f.number) end,''claimed_by'',i.claimed_by,''created_at'',i.created_at)';
      search_sql := '(coalesce(i.name,'''') ilike ''%''||$1||''%'' or coalesce(i.identity_value,i.email,i.phone,'''') ilike ''%''||$1||''%'' or coalesce(f.number,'''') ilike ''%''||$1||''%'')';
      sort_sql := 'i.created_at';
      direction_sql := 'desc';
      filter_sql := ' and ($2->>''status'' is null or ($2->>''status''=''joined'' and i.claimed_by is not null) or ($2->>''status''=''pending'' and i.claimed_by is null))';
    when 'amenities' then
      source_sql := 'amenities a';
      row_sql := 'to_jsonb(a)';
      search_sql := '(a.name ilike ''%''||$1||''%'' or coalesce(a.description,'''') ilike ''%''||$1||''%'')';
      sort_sql := 'encode(convert_to(lower(a.name),''UTF8''),''hex'')';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''active'' is null or a.is_active=($2->>''active'')::boolean)';
    when 'bookings' then
      source_sql := 'amenity_bookings b join amenities a on a.id=b.amenity_id join flats f on f.id=b.flat_id';
      row_sql := 'jsonb_build_object(''id'',b.id,''starts_at'',b.starts_at,''ends_at'',b.ends_at,''status'',b.status,''amenity_id'',b.amenity_id,''flat_id'',b.flat_id,''booked_by'',b.booked_by,''decided_by'',b.decided_by,''decided_at'',b.decided_at,''decision_reason'',b.decision_reason,''amenity'',jsonb_build_object(''id'',a.id,''name'',a.name),''flat'',jsonb_build_object(''id'',f.id,''number'',f.number))';
      search_sql := '(a.name ilike ''%''||$1||''%'' or f.number ilike ''%''||$1||''%'')';
      sort_sql := 'b.created_at';
      direction_sql := 'desc';
      filter_sql := ' and ($2->>''status'' is null or b.status=$2->>''status'')'
        || ' and ($2->>''decided'' is null or (b.decided_at is not null)=($2->>''decided'')::boolean)';
    when 'staff' then
      source_sql := 'staff s';
      row_sql := 'jsonb_build_object(''id'',s.id,''name'',s.name,''category'',s.category,''phone'',s.phone,''checkin_code'',s.checkin_code,''is_active'',s.is_active)';
      search_sql := '(s.name ilike ''%''||$1||''%'' or s.category ilike ''%''||$1||''%'' or coalesce(s.phone,'''') ilike ''%''||$1||''%'' or coalesce(s.checkin_code,'''') ilike ''%''||$1||''%'')';
      sort_sql := 'encode(convert_to(lower(s.category),''UTF8''),''hex'')||'':''||encode(convert_to(lower(s.name),''UTF8''),''hex'')';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''active'' is null or s.is_active=($2->>''active'')::boolean)';
    when 'providers' then
      source_sql := 'service_providers s';
      row_sql := 'jsonb_build_object(''id'',s.id,''name'',s.name,''category'',s.category,''phone'',s.phone,''photo_url'',s.photo_url,''description'',s.description,''is_verified'',s.is_verified,''is_available'',s.is_available,''availability_text'',s.availability_text)';
      search_sql := '(s.name ilike ''%''||$1||''%'' or s.category ilike ''%''||$1||''%'')';
      sort_sql := 'encode(convert_to(lower(s.category),''UTF8''),''hex'')||'':''||encode(convert_to(lower(s.name),''UTF8''),''hex'')';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''category'' is null or s.category=$2->>''category'')';
    when 'dues' then
      source_sql := 'maintenance_dues d join flats f on f.id=d.flat_id join towers t on t.id=f.tower_id';
      row_sql := 'jsonb_build_object(''id'',d.id,''period'',d.period,''amount'',d.amount,''due_on'',d.due_on,''late_fee_amount'',d.late_fee_amount,''late_fee_applied_at'',d.late_fee_applied_at,''late_fee_waived_at'',d.late_fee_waived_at,''status'',d.status,''paid_at'',d.paid_at,''claimed_at'',d.claimed_at,''payment_note'',d.payment_note,''flat'',jsonb_build_object(''id'',f.id,''number'',f.number,''tower_name'',t.name))';
      search_sql := '(f.number ilike ''%''||$1||''%'' or t.name ilike ''%''||$1||''%'' or d.period ilike ''%''||$1||''%'')';
      sort_sql := 'd.period';
      direction_sql := 'desc';
      filter_sql := ' and ($2->>''status'' is null or d.status=$2->>''status'')';
    when 'polls' then
      source_sql := 'polls p left join lateral (select count(*)::int count from poll_votes v where v.poll_id=p.id) vc on true';
      row_sql := 'jsonb_build_object(''id'',p.id,''question'',p.question,''options'',p.options,''opens_at'',p.opens_at,''closes_at'',p.closes_at,''closed_at'',p.closed_at,''quorum_percent'',p.quorum_percent,''target_tower_ids'',p.target_tower_ids,''target_flat_ids'',p.target_flat_ids,''attachments'',p.attachments,''created_at'',p.created_at,''vote_count'',vc.count)';
      search_sql := 'p.question ilike ''%''||$1||''%''';
      sort_sql := 'p.created_at';
      direction_sql := 'desc';
    when 'notices' then
      source_sql := 'notices n left join lateral (select count(*)::int count from notice_reads r where r.notice_id=n.id) rc on true';
      row_sql := 'jsonb_build_object(''id'',n.id,''title'',n.title,''body'',n.body,''published_at'',n.published_at,''expires_at'',n.expires_at,''attachments'',n.attachments,''target_tower_ids'',n.target_tower_ids,''target_flat_ids'',n.target_flat_ids,''created_at'',n.created_at,''read_count'',rc.count)';
      search_sql := '(n.title ilike ''%''||$1||''%'' or n.body ilike ''%''||$1||''%'')';
      sort_sql := 'n.created_at';
      direction_sql := 'desc';
    else
      raise exception 'unsupported admin dataset' using errcode='22023';
  end case;

  filter_sql := case p_dataset
    when 'towers' then 't.society_id=$3' || filter_sql
    when 'flats' then 'f.society_id=$3' || filter_sql
    when 'profiles' then 'p.society_id=$3' || filter_sql
    when 'invites' then 'i.society_id=$3' || filter_sql
    when 'amenities' then 'a.society_id=$3' || filter_sql
    when 'bookings' then 'a.society_id=$3' || filter_sql
    when 'staff' then 's.society_id=$3' || filter_sql
    when 'providers' then 's.society_id=$3' || filter_sql
    when 'dues' then 'd.society_id=$3' || filter_sql
    when 'polls' then 'p.society_id=$3' || filter_sql
    when 'notices' then 'n.society_id=$3' || filter_sql end;

  statement := format(
    'with filtered as (
       select %1$s row_data, (%2$s)::text sort_key,
         (%3$s)::text cursor_id
       from %4$s
       where %5$s and ($1 is null or $1='''' or %6$s)
     ), page as (
       select * from filtered
       where ($4 is null or
         (sort_key,cursor_id) %7$s ($4,$5))
       order by sort_key %8$s, cursor_id %8$s limit $6
     )
     select jsonb_build_object(
       ''rows'',coalesce((select jsonb_agg(row_data order by sort_key %8$s,cursor_id %8$s) from page),''[]''::jsonb),
       ''total_count'',(select count(*) from filtered),
       ''next_cursor'',(select jsonb_build_object(''sort'',sort_key,''id'',cursor_id) from page order by sort_key %9$s,cursor_id %9$s limit 1),
       ''has_more'',(select count(*)=$6 from page)
     )',
    row_sql, sort_sql,
    case p_dataset
      when 'towers' then 't.id' when 'flats' then 'f.id'
      when 'profiles' then 'p.id' when 'invites' then 'i.id'
      when 'amenities' then 'a.id' when 'bookings' then 'b.id'
      when 'staff' then 's.id' when 'providers' then 's.id'
      when 'dues' then 'd.id' when 'polls' then 'p.id' else 'n.id' end,
    source_sql, filter_sql, search_sql,
    case direction_sql when 'asc' then '>' else '<' end,
    direction_sql, case direction_sql when 'asc' then 'desc' else 'asc' end
  );
  execute statement into result using nullif(trim(p_search),''),
    coalesce(p_filters,'{}'::jsonb), caller.society_id,
    p_after->>'sort', p_after->>'id', bounded_limit;
  return result;
end $$;
