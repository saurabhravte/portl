-- 0033_maintenance_late_fees.sql
-- Feature #69: auto-applied late fees on maintenance dues.
-- amount stays immutable; late_fee_amount is additive.

alter table maintenance_dues
  add column if not exists due_on date,
  add column if not exists late_fee_amount numeric(10,2) not null default 0
    check (late_fee_amount >= 0),
  add column if not exists late_fee_applied_at timestamptz,
  add column if not exists late_fee_waived_at timestamptz;

-- Backfill due_on: period month end (YYYY-MM → last day), else created_at + 10 days.
update maintenance_dues
   set due_on = coalesce(
     due_on,
     ((period || '-01')::date + interval '1 month' - interval '1 day')::date
   )
 where due_on is null
   and period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$';

update maintenance_dues
   set due_on = (created_at::date + 10)
 where due_on is null;

create index if not exists maintenance_dues_late_fee_pending_idx
  on maintenance_dues (society_id, due_on)
  where status in ('due', 'claimed')
    and late_fee_applied_at is null
    and late_fee_waived_at is null;

create or replace function due_payable_amount(
  p_amount numeric,
  p_late_fee_amount numeric,
  p_late_fee_waived_at timestamptz
) returns numeric
language sql immutable as $$
  select coalesce(p_amount, 0)
       + case when p_late_fee_waived_at is null
              then coalesce(p_late_fee_amount, 0)
              else 0 end;
$$;

-- Society settings helpers (JSON on societies.settings).
create or replace function society_late_fee_config(p_society uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', coalesce((s.settings->>'lateFeeEnabled')::boolean, false),
    'graceDays', greatest(coalesce((s.settings->>'lateFeeGraceDays')::int, 0), 0),
    'flatAmount', greatest(coalesce((s.settings->>'lateFeeAmount')::numeric, 0), 0),
    'percent', greatest(coalesce((s.settings->>'lateFeePercent')::numeric, 0), 0),
    'dueDay', least(greatest(coalesce((s.settings->>'duesDueDay')::int, 10), 1), 28)
  )
  from societies s where s.id = p_society;
$$;

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

create or replace function enforce_due_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
  late_only boolean;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from flats f
      where f.id = new.flat_id and f.society_id = new.society_id
    ) then
      raise exception 'due flat must belong to its society'
        using errcode = '23514';
    end if;
    if new.due_on is null then
      new.due_on := ((new.period || '-01')::date + interval '1 month' - interval '1 day')::date;
    end if;
    if current_user = 'authenticated'
       and (
         caller_role <> 'admin'
         or new.status <> 'due'
         or new.paid_at is not null
         or new.claimed_at is not null
         or new.claimed_by is not null
         or new.confirmed_by is not null
         or new.late_fee_applied_at is not null
       ) then
      raise exception 'new dues must start outstanding without settlement metadata'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.society_id is distinct from old.society_id
     or new.flat_id is distinct from old.flat_id
     or new.period is distinct from old.period
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at then
    raise exception 'due ledger identity is immutable' using errcode = '42501';
  end if;

  late_only :=
    new.status is not distinct from old.status
    and new.paid_at is not distinct from old.paid_at
    and new.claimed_at is not distinct from old.claimed_at
    and new.claimed_by is not distinct from old.claimed_by
    and new.confirmed_by is not distinct from old.confirmed_by
    and new.payment_note is not distinct from old.payment_note
    and (
      new.due_on is distinct from old.due_on
      or new.late_fee_amount is distinct from old.late_fee_amount
      or new.late_fee_applied_at is distinct from old.late_fee_applied_at
      or new.late_fee_waived_at is distinct from old.late_fee_waived_at
    );

  -- Security-definer / service-role path (Razorpay settle, late-fee worker).
  if caller_role is null then
    return new;
  end if;

  if late_only and caller_role = 'admin' then
    return new;
  end if;

  if caller_role = 'resident' then
    if old.status <> 'due'
       or new.status <> 'claimed'
       or new.claimed_by is distinct from clerk_uid()
       or new.claimed_at is null
       or new.paid_at is not null
       or new.confirmed_by is not null
       or new.late_fee_amount is distinct from old.late_fee_amount
       or new.late_fee_applied_at is distinct from old.late_fee_applied_at
       or new.late_fee_waived_at is distinct from old.late_fee_waived_at then
      raise exception 'residents may only claim an outstanding due'
        using errcode = '42501';
    end if;
  elsif caller_role = 'admin' then
    if not (
      (old.status = 'due' and new.status in ('paid', 'waived'))
      or (old.status = 'claimed' and new.status in ('due', 'paid', 'waived'))
    ) then
      raise exception 'invalid administrative due transition'
        using errcode = '23514';
    end if;
    if new.status = 'paid' and new.paid_at is null then
      raise exception 'paid dues require a payment timestamp'
        using errcode = '23514';
    end if;
    if old.status = 'claimed' and new.status = 'paid'
       and new.confirmed_by is distinct from clerk_uid() then
      raise exception 'claim confirmation must identify the administrator'
        using errcode = '23514';
    end if;
    if new.status = 'due'
       and (
         new.claimed_at is not null
         or new.claimed_by is not null
         or new.confirmed_by is not null
         or new.paid_at is not null
       ) then
      raise exception 'rejected claims must clear settlement metadata'
        using errcode = '23514';
    end if;
  else
    raise exception 'due updates require a resident or administrator'
      using errcode = '42501';
  end if;
  return new;
end $$;

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
  -- Cron / service_role: clerk_uid() is null → process all societies.
  -- Authenticated callers must be admins and only touch their society.
  if clerk_uid() is not null then
    if my_role() <> 'admin' then
      raise exception 'admins only' using errcode = '42501';
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
revoke all on function apply_maintenance_late_fees(integer) from public;
grant execute on function apply_maintenance_late_fees(integer) to service_role;
grant execute on function apply_maintenance_late_fees(integer) to authenticated;

create or replace function waive_due_late_fee(p_due_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  if my_role() <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  -- Waive an applied fee, or pre-waive so the daily job skips this due.
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
revoke all on function waive_due_late_fee(uuid) from public;
grant execute on function waive_due_late_fee(uuid) to authenticated;

-- Patch admin dues dataset projection to include late-fee fields.
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
      row_sql := 'jsonb_build_object(''id'',s.id,''name'',s.name,''category'',s.category,''phone'',s.phone,''is_active'',s.is_active)';
      search_sql := '(s.name ilike ''%''||$1||''%'' or s.category ilike ''%''||$1||''%'' or coalesce(s.phone,'''') ilike ''%''||$1||''%'')';
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

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule(
      'portl-maintenance-late-fees-v0033',
      '15 1 * * *',
      'select public.apply_maintenance_late_fees(500);'
    );
  end if;
exception when others then
  raise notice 'Late fee cron not installed: %', sqlerrm;
end $$;
