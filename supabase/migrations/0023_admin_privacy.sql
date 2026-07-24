-- 0023: Large admin datasets, immutable audit, and privacy lifecycle.

-- ── Stable, bounded admin dataset contract ──────────────────────────────────
create index if not exists towers_society_name_id_idx
  on towers(society_id, lower(name), id);
create index if not exists flats_society_tower_number_id_idx
  on flats(society_id, tower_id, lower(number), id);
create index if not exists profiles_society_role_name_id_idx
  on profiles(society_id, role, lower(name), id);
create index if not exists invites_society_created_id_idx
  on invites(society_id, created_at desc, id desc);
create index if not exists amenities_society_name_id_idx
  on amenities(society_id, lower(name), id);
create index if not exists amenity_bookings_amenity_created_id_idx
  on amenity_bookings(amenity_id, created_at desc, id desc);
create index if not exists staff_society_category_name_id_idx
  on staff(society_id, lower(category), lower(name), id);
create index if not exists providers_society_category_name_id_idx
  on service_providers(society_id, lower(category), lower(name), id);
create index if not exists dues_society_period_status_id_idx
  on maintenance_dues(society_id, period desc, status, id desc);
create index if not exists polls_society_created_id_idx
  on polls(society_id, created_at desc, id desc);
create index if not exists notices_society_created_id_idx
  on notices(society_id, created_at desc, id desc);

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
      sort_sql := 'lower(t.name)';
      direction_sql := 'asc';
    when 'flats' then
      source_sql := 'flats f join towers t on t.id=f.tower_id';
      row_sql := 'jsonb_build_object(''id'',f.id,''number'',f.number,''occupancy_status'',f.occupancy_status,''tower'',jsonb_build_object(''id'',t.id,''name'',t.name))';
      search_sql := '(f.number ilike ''%''||$1||''%'' or t.name ilike ''%''||$1||''%'')';
      sort_sql := 'lower(t.name)||chr(0)||lower(f.number)';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''tower_id'' is null or f.tower_id::text=$2->>''tower_id'')'
        || ' and ($2->>''occupancy_status'' is null or f.occupancy_status=$2->>''occupancy_status'')';
    when 'profiles' then
      source_sql := 'profiles p left join flats f on f.id=p.flat_id left join towers t on t.id=f.tower_id';
      row_sql := 'jsonb_build_object(''id'',p.id,''name'',p.name,''role'',p.role,''phone'',p.phone,''flat'',case when f.id is null then null else jsonb_build_object(''id'',f.id,''number'',f.number,''tower_name'',t.name) end)';
      search_sql := '(p.name ilike ''%''||$1||''%'' or coalesce(p.phone,'''') ilike ''%''||$1||''%'' or coalesce(f.number,'''') ilike ''%''||$1||''%'')';
      sort_sql := 'lower(p.name)';
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
      sort_sql := 'lower(a.name)';
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
      sort_sql := 'lower(s.category)||chr(0)||lower(s.name)';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''active'' is null or s.is_active=($2->>''active'')::boolean)';
    when 'providers' then
      source_sql := 'service_providers s';
      row_sql := 'jsonb_build_object(''id'',s.id,''name'',s.name,''category'',s.category,''phone'',s.phone,''photo_url'',s.photo_url,''description'',s.description,''is_verified'',s.is_verified,''is_available'',s.is_available,''availability_text'',s.availability_text)';
      search_sql := '(s.name ilike ''%''||$1||''%'' or s.category ilike ''%''||$1||''%'')';
      sort_sql := 'lower(s.category)||chr(0)||lower(s.name)';
      direction_sql := 'asc';
      filter_sql := ' and ($2->>''category'' is null or s.category=$2->>''category'')';
    when 'dues' then
      source_sql := 'maintenance_dues d join flats f on f.id=d.flat_id join towers t on t.id=f.tower_id';
      row_sql := 'jsonb_build_object(''id'',d.id,''period'',d.period,''amount'',d.amount,''status'',d.status,''paid_at'',d.paid_at,''claimed_at'',d.claimed_at,''payment_note'',d.payment_note,''flat'',jsonb_build_object(''id'',f.id,''number'',f.number,''tower_name'',t.name))';
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

  -- Every source above exposes its society as the first matching alias.
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

-- ── Transactional, idempotent flat import ───────────────────────────────────
create table flat_import_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  actor_id text not null,
  idempotency_key text not null,
  dry_run boolean not null,
  all_or_nothing boolean not null,
  status text not null check(status in ('validated','applied','rejected')),
  row_count integer not null,
  success_count integer not null,
  failure_count integer not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique(society_id,idempotency_key)
);
alter table flat_import_jobs enable row level security;
create policy flat_import_jobs_admin_read on flat_import_jobs for select
  using(my_role()='admin' and society_id=my_society());

create or replace function import_flats_transactional(
  p_idempotency_key text,
  p_rows jsonb,
  p_dry_run boolean default true,
  p_all_or_nothing boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  caller profiles;
  existing flat_import_jobs;
  item jsonb;
  report jsonb := '[]'::jsonb;
  normalized_tower text;
  tower_name text;
  flat_number text;
  line_number integer;
  failures integer := 0;
  successes integer := 0;
  tower_id uuid;
  created_towers integer := 0;
  created_flats integer := 0;
  job_id uuid;
  row_key text;
  seen_keys text[] := '{}';
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role<>'admin' then raise exception 'admins only' using errcode='42501'; end if;
  if length(trim(coalesce(p_idempotency_key,'')))<8 then
    raise exception 'idempotency key is required' using errcode='22023';
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1
     or jsonb_array_length(p_rows)>500 then
    raise exception 'import must contain 1 to 500 rows' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller.society_id::text,23));
  select * into existing from flat_import_jobs
    where society_id=caller.society_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object(
    'job_id',existing.id,'status',existing.status,'dry_run',existing.dry_run,
    'rows',existing.report,'success_count',existing.success_count,
    'failure_count',existing.failure_count,'idempotent_replay',true
  ); end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    line_number := case when (item->>'line') ~ '^[0-9]+$' then (item->>'line')::integer else 0 end;
    tower_name := regexp_replace(trim(coalesce(item->>'tower','')),'\s+',' ','g');
    flat_number := regexp_replace(trim(coalesce(item->>'flat','')),'\s+',' ','g');
    normalized_tower := lower(tower_name);
    row_key := normalized_tower||chr(0)||lower(flat_number);
    if line_number<1 or length(tower_name) not between 1 and 80
       or length(flat_number) not between 1 and 40 then
      failures := failures+1;
      report := report||jsonb_build_array(jsonb_build_object(
        'line',line_number,'tower',tower_name,'flat',flat_number,
        'status','failed','code','invalid_row','message','Tower, flat and positive line number are required.'
      ));
    elsif row_key=any(seen_keys) then
      failures := failures+1;
      report := report||jsonb_build_array(jsonb_build_object(
        'line',line_number,'tower',tower_name,'flat',flat_number,
        'status','failed','code','duplicate_input','message','Duplicate tower and flat in this import.'
      ));
    else
      seen_keys:=array_append(seen_keys,row_key);
      successes := successes+1;
      report := report||jsonb_build_array(jsonb_build_object(
        'line',line_number,'tower',tower_name,'flat',flat_number,
        'status',case when exists(
          select 1 from flats f join towers t on t.id=f.tower_id
          where f.society_id=caller.society_id
            and lower(regexp_replace(trim(t.name),'\s+',' ','g'))=normalized_tower
            and lower(f.number)=lower(flat_number)
        ) then 'existing' else case when p_dry_run then 'would_create' else 'ready' end end
      ));
    end if;
  end loop;

  if not p_dry_run and (failures=0 or not p_all_or_nothing) then
    for item in select value from jsonb_array_elements(report)
      where value->>'status' in ('ready','would_create') loop
      tower_name := item->>'tower'; flat_number := item->>'flat';
      normalized_tower := lower(regexp_replace(trim(tower_name),'\s+',' ','g'));
      select id into tower_id from towers
        where society_id=caller.society_id
          and lower(regexp_replace(trim(name),'\s+',' ','g'))=normalized_tower
        order by id limit 1 for update;
      if tower_id is null then
        insert into towers(society_id,name) values(caller.society_id,tower_name)
          returning id into tower_id;
        created_towers:=created_towers+1;
      end if;
      insert into flats(society_id,tower_id,number)
        values(caller.society_id,tower_id,flat_number)
        on conflict(tower_id,number) do nothing;
      if found then created_flats:=created_flats+1; end if;
    end loop;
    report := (
      select coalesce(jsonb_agg(
        case when value->>'status'='ready'
          then jsonb_set(value,'{status}','"created"') else value end
        order by ordinality
      ),'[]'::jsonb)
      from jsonb_array_elements(report) with ordinality
    );
  end if;

  insert into flat_import_jobs(
    society_id,actor_id,idempotency_key,dry_run,all_or_nothing,status,row_count,
    success_count,failure_count,report
  ) values(
    caller.society_id,caller.id,p_idempotency_key,p_dry_run,p_all_or_nothing,
    case when failures>0 and p_all_or_nothing then 'rejected'
         when p_dry_run then 'validated' else 'applied' end,
    jsonb_array_length(p_rows),successes,failures,report
  ) returning id into job_id;
  return jsonb_build_object(
    'job_id',job_id,
    'status',case when failures>0 and p_all_or_nothing then 'rejected'
                  when p_dry_run then 'validated' else 'applied' end,
    'dry_run',p_dry_run,'rows',report,'success_count',successes,
    'failure_count',failures,'created_towers',created_towers,
    'created_flats',created_flats,'idempotent_replay',false
  );
end $$;

create or replace function raise_dues_for_all_flats(p_period text,p_amount numeric)
returns integer
language plpgsql security definer set search_path=public as $$
declare caller profiles; affected integer;
begin
  select * into caller from profiles where id=clerk_uid();
  if caller.role is distinct from 'admin' then raise exception 'admins only' using errcode='42501'; end if;
  if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_amount<=0 then
    raise exception 'invalid period or amount' using errcode='22023';
  end if;
  insert into maintenance_dues(society_id,flat_id,period,amount)
    select caller.society_id,f.id,p_period,p_amount
    from flats f where f.society_id=caller.society_id
    on conflict(flat_id,period) do nothing;
  get diagnostics affected=row_count;
  return affected;
end $$;

-- ── Immutable, append-only administrative audit ─────────────────────────────
create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  actor_id text,
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text,
  correlation_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_society_created_id_idx
  on admin_audit_events(society_id,created_at desc,id desc);
alter table admin_audit_events enable row level security;
create policy admin_audit_admin_read on admin_audit_events for select
  using(my_role()='admin' and society_id=my_society());

create or replace function admin_audit_page(
  p_limit integer default 25,p_after jsonb default null,p_search text default null,
  p_action text default null,p_target_type text default null
) returns jsonb
language sql stable security definer set search_path=public as $$
  with caller as (
    select society_id from profiles where id=clerk_uid() and role='admin'
  ), filtered as (
    select e.* from admin_audit_events e,caller
    where e.society_id=caller.society_id
      and (nullif(trim(p_search),'') is null
        or e.action ilike '%'||trim(p_search)||'%'
        or e.target_type ilike '%'||trim(p_search)||'%'
        or coalesce(e.target_id,'') ilike '%'||trim(p_search)||'%')
      and (p_action is null or e.action=p_action)
      and (p_target_type is null or e.target_type=p_target_type)
  ), page as (
    select * from filtered
    where p_after is null or
      (created_at,id)<((p_after->>'created_at')::timestamptz,(p_after->>'id')::uuid)
    order by created_at desc,id desc
    limit least(greatest(coalesce(p_limit,25),1),100)
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'total_count',(select count(*) from filtered),
    'next_cursor',(select jsonb_build_object('created_at',created_at,'id',id)
      from page order by created_at,id limit 1),
    'has_more',(select count(*)=least(greatest(coalesce(p_limit,25),1),100) from page)
  )
$$;

create or replace function prevent_admin_audit_mutation() returns trigger
language plpgsql set search_path=public as $$
begin raise exception 'admin audit events are immutable' using errcode='42501'; end $$;
create trigger trg_admin_audit_immutable before update or delete on admin_audit_events
  for each row execute function prevent_admin_audit_mutation();

create or replace function sanitized_audit_state(p_table text,p_row jsonb) returns jsonb
language sql immutable set search_path=public as $$
  select case p_table
    when 'profiles' then p_row - array['name','phone','email','expo_push_token']
    when 'invites' then p_row - array['name','phone','email','identity_value']
    when 'staff' then p_row - array['name','phone','photo_url']
    when 'service_providers' then p_row - array['name','phone','photo_url','description']
    when 'notices' then p_row - array['body','attachments','attachment_url']
    else p_row - array['phone','email','name','photo_url','photos','attachments','payment_note']
  end
$$;

create or replace function capture_admin_audit_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  actor profiles;
  source jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  society uuid;
  correlation uuid;
begin
  select * into actor from profiles where id=clerk_uid();
  if actor.role is distinct from 'admin' then return coalesce(new,old); end if;
  society := coalesce((source->>'society_id')::uuid,actor.society_id);
  begin
    correlation := coalesce(
      nullif((nullif(current_setting('request.headers',true),'')::jsonb)->>'x-correlation-id','')::uuid,
      gen_random_uuid()
    );
  exception when others then correlation:=gen_random_uuid(); end;
  insert into admin_audit_events(
    society_id,actor_id,actor_role,action,target_type,target_id,correlation_id,
    before_state,after_state
  ) values(
    society,actor.id,actor.role,lower(tg_op),tg_table_name,source->>'id',correlation,
    case when tg_op in ('UPDATE','DELETE') then sanitized_audit_state(tg_table_name,to_jsonb(old)) end,
    case when tg_op in ('INSERT','UPDATE') then sanitized_audit_state(tg_table_name,to_jsonb(new)) end
  );
  return coalesce(new,old);
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'towers','flats','profiles','invites','amenities','amenity_bookings',
    'staff','service_providers','maintenance_dues','polls','notices'
  ] loop
    execute format('drop trigger if exists trg_admin_audit on %I',table_name);
    execute format(
      'create trigger trg_admin_audit after insert or update or delete on %I for each row execute function capture_admin_audit_event()',
      table_name
    );
  end loop;
end $$;

-- ── Export artifacts and privacy lifecycle ──────────────────────────────────
insert into storage.buckets(id,name,public,file_size_limit)
values('privacy-artifacts','privacy-artifacts',false,52428800)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

create table export_artifacts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  owner_id text,
  kind text not null check(kind in ('personal_json','admin_audit_csv','admin_audit_json')),
  storage_path text,
  status text not null check(status in ('pending','ready','failed','expired')),
  expires_at timestamptz,
  byte_size bigint,
  sha256 text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index export_artifacts_owner_created_idx on export_artifacts(owner_id,created_at desc);
alter table export_artifacts enable row level security;
create policy export_artifacts_owner_read on export_artifacts for select
  using(owner_id=clerk_uid() or (my_role()='admin' and society_id=my_society()));

create table personal_data_export_requests (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  profile_id text not null,
  status text not null check(status in ('pending','processing','ready','failed','expired')),
  artifact_id uuid references export_artifacts(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);
create unique index personal_export_one_active_idx
  on personal_data_export_requests(profile_id)
  where status in ('pending','processing','ready');
alter table personal_data_export_requests enable row level security;
create policy personal_export_self_read on personal_data_export_requests for select
  using(profile_id=clerk_uid());

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  profile_id text not null,
  status text not null check(status in ('pending','cancelled','processing','completed','held','failed')),
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  error_code text
);
create unique index account_deletion_one_active_idx
  on account_deletion_requests(profile_id) where status in ('pending','processing','held');
alter table account_deletion_requests enable row level security;
create policy account_deletion_self_read on account_deletion_requests for select
  using(profile_id=clerk_uid());

create table privacy_legal_holds (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  profile_id text,
  scope text not null,
  reason_code text not null,
  placed_by text not null,
  placed_at timestamptz not null default now(),
  released_by text,
  released_at timestamptz
);
create index privacy_holds_active_idx on privacy_legal_holds(society_id,profile_id)
  where released_at is null;
alter table privacy_legal_holds enable row level security;
create policy privacy_holds_admin_read on privacy_legal_holds for select
  using(my_role()='admin' and society_id=my_society());

create or replace function set_privacy_legal_hold(
  p_profile_id text,p_scope text,p_reason_code text,p_hold boolean
) returns uuid
language plpgsql security definer set search_path=public as $$
declare caller profiles; hold_id uuid;
begin
  select * into caller from profiles where id=clerk_uid();
  if caller.role is distinct from 'admin' then raise exception 'admins only' using errcode='42501'; end if;
  if coalesce(p_scope,'') !~ '^[a-z0-9_:-]{2,40}$'
     or coalesce(p_reason_code,'') !~ '^[a-z0-9_:-]{2,40}$' then
    raise exception 'scope and reason must be non-PII policy codes' using errcode='22023';
  end if;
  if p_profile_id is not null and not exists(
    select 1 from profiles where id=p_profile_id and society_id=caller.society_id
  ) then raise exception 'profile is outside this society' using errcode='42501'; end if;
  if p_hold then
    select id into hold_id from privacy_legal_holds
      where society_id=caller.society_id and profile_id is not distinct from p_profile_id
        and scope=p_scope and released_at is null order by placed_at desc limit 1;
    if hold_id is null then
      insert into privacy_legal_holds(society_id,profile_id,scope,reason_code,placed_by)
        values(caller.society_id,p_profile_id,trim(p_scope),trim(p_reason_code),caller.id)
        returning id into hold_id;
    end if;
  else
    update privacy_legal_holds set released_at=now(),released_by=caller.id
      where society_id=caller.society_id and profile_id is not distinct from p_profile_id
        and scope=p_scope and released_at is null returning id into hold_id;
  end if;
  insert into admin_audit_events(
    society_id,actor_id,actor_role,action,target_type,target_id,correlation_id,after_state
  ) values(
    caller.society_id,caller.id,caller.role,
    case when p_hold then 'legal_hold_placed' else 'legal_hold_released' end,
    'privacy_legal_holds',hold_id::text,gen_random_uuid(),
    jsonb_build_object('profile_id',p_profile_id,'scope',p_scope,'reason_code',p_reason_code)
  );
  return hold_id;
end $$;

create table admin_export_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id),
  actor_id text not null,
  format text not null check(format in ('csv','json')),
  filters jsonb not null default '{}',
  status text not null check(status in ('pending','processing','ready','failed','expired')),
  artifact_id uuid references export_artifacts(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);
alter table admin_export_jobs enable row level security;
create policy admin_export_jobs_read on admin_export_jobs for select
  using(my_role()='admin' and society_id=my_society());

create or replace function request_personal_data_export() returns uuid
language plpgsql security definer set search_path=public as $$
declare caller profiles; request_id uuid;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found then raise exception 'profile required' using errcode='42501'; end if;
  select id into request_id from personal_data_export_requests
    where profile_id=caller.id and status in ('pending','processing','ready')
    order by requested_at desc limit 1;
  if request_id is not null then return request_id; end if;
  insert into personal_data_export_requests(society_id,profile_id,status)
    values(caller.society_id,caller.id,'pending') returning id into request_id;
  return request_id;
end $$;

create or replace function request_account_deletion_internal(
  p_profile_id text,p_default_grace_days integer
) returns uuid
language plpgsql security definer set search_path=public as $$
declare caller profiles; grace integer; request_id uuid;
begin
  select * into caller from profiles where id=p_profile_id;
  if not found then raise exception 'profile required' using errcode='42501'; end if;
  grace := coalesce(
    nullif((select settings->>'accountDeletionGraceDays' from societies where id=caller.society_id),'')::integer,
    p_default_grace_days
  );
  if grace is null or grace<0 or grace>365 then
    raise exception 'account deletion grace policy is not configured' using errcode='22023';
  end if;
  select id into request_id from account_deletion_requests
    where profile_id=caller.id and status in ('pending','processing','held')
    order by requested_at desc limit 1;
  if request_id is not null then return request_id; end if;
  insert into account_deletion_requests(society_id,profile_id,status,execute_after)
    values(caller.society_id,caller.id,'pending',now()+make_interval(days=>grace))
    returning id into request_id;
  delete from push_tokens where user_id=caller.id;
  update profiles set expo_push_token=null where id=caller.id;
  update guard_device_sessions set status='revoked',revoked_at=now(),revoke_reason='account_deletion'
    where guard_id=caller.id and status='active';
  return request_id;
end $$;

create or replace function request_account_deletion() returns uuid
language sql security definer set search_path=public as $$
  select request_account_deletion_internal(clerk_uid(),null)
$$;

create or replace function request_account_deletion_for(
  p_profile_id text,p_default_grace_days integer
) returns uuid
language sql security definer set search_path=public as $$
  select request_account_deletion_internal(p_profile_id,p_default_grace_days)
$$;

create or replace function cancel_account_deletion() returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update account_deletion_requests set status='cancelled',cancelled_at=now()
    where profile_id=clerk_uid() and status='pending';
  return found;
end $$;

create or replace function create_admin_audit_export(
  p_format text,p_filters jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare caller profiles; job_id uuid; artifact_id uuid;
begin
  select * into caller from profiles where id=clerk_uid();
  if caller.role is distinct from 'admin' then raise exception 'admins only' using errcode='42501'; end if;
  if p_format not in ('csv','json') then raise exception 'invalid export format' using errcode='22023'; end if;
  insert into export_artifacts(society_id,owner_id,kind,status)
    values(caller.society_id,caller.id,
      case p_format when 'csv' then 'admin_audit_csv' else 'admin_audit_json' end,'pending')
    returning id into artifact_id;
  insert into admin_export_jobs(society_id,actor_id,format,filters,status,artifact_id)
    values(caller.society_id,caller.id,p_format,coalesce(p_filters,'{}'),'pending',artifact_id)
    returning id into job_id;
  return job_id;
end $$;

-- Service worker snapshot deliberately omits credentials, push tokens and raw
-- visitor contact data. Operational identifiers remain available for support.
create or replace function build_personal_export_snapshot(p_profile_id text) returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'generated_at',now(),
    'profile',(select jsonb_build_object(
      'id',p.id,'name',p.name,'phone',p.phone,'email',p.email,'role',p.role,
      'society_id',p.society_id,'flat_id',p.flat_id,'created_at',p.created_at
    ) from profiles p where p.id=p_profile_id),
    'visitor_requests',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'status',r.status,'created_at',r.created_at,'visitor_type',v.type
    )) from visitor_requests r join visitors v on v.id=r.visitor_id
      where r.raised_by=p_profile_id),'[]'::jsonb),
    'bookings',coalesce((select jsonb_agg(to_jsonb(b)-array['decision_reason'])
      from amenity_bookings b where b.booked_by=p_profile_id),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'type',n.type,'read_at',n.read_at,'created_at',n.created_at
    )) from notifications n where n.user_id=p_profile_id),'[]'::jsonb)
  )
$$;

create table cleanup_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  dry_run boolean not null,
  scanned_count integer not null,
  affected_count integer not null,
  evidence jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);
alter table cleanup_job_runs enable row level security;
create policy cleanup_runs_admin_read on cleanup_job_runs for select
  using(my_role()='admin');

create or replace function run_privacy_retention_cleanup(
  p_limit integer default 200,p_dry_run boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare bounded integer:=least(greatest(coalesce(p_limit,200),1),1000);
  expired_ids uuid[]; scanned integer; affected integer:=0; run_id uuid;
begin
  select array_agg(id),count(*) into expired_ids,scanned from (
    select a.id from export_artifacts a
    where a.status='ready' and a.expires_at<now()
      and not exists(select 1 from privacy_legal_holds h
        where h.released_at is null and h.society_id=a.society_id
          and (h.profile_id is null or h.profile_id=a.owner_id))
    order by a.expires_at for update skip locked limit bounded
  ) due;
  if not p_dry_run and cardinality(coalesce(expired_ids,'{}'))>0 then
    update export_artifacts set status='expired' where id=any(expired_ids);
    get diagnostics affected=row_count;
    update personal_data_export_requests set status='expired'
      where artifact_id=any(expired_ids) and status='ready';
    update admin_export_jobs set status='expired'
      where artifact_id=any(expired_ids) and status='ready';
  end if;
  insert into cleanup_job_runs(job_type,dry_run,scanned_count,affected_count,evidence)
    values('expired_artifacts',p_dry_run,coalesce(scanned,0),affected,
      jsonb_build_object('candidate_ids',coalesce(to_jsonb(expired_ids),'[]'::jsonb)))
    returning id into run_id;
  return jsonb_build_object('run_id',run_id,'scanned',coalesce(scanned,0),
    'affected',affected,'dry_run',p_dry_run);
end $$;

create or replace function list_orphan_media(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name))
    from (
      select o.bucket_id,o.name from storage.objects o
      where o.bucket_id in ('society-media','privacy-artifacts')
        and not exists(select 1 from visitors v where v.photo_url in (o.name,o.bucket_id||':'||o.name))
        and not exists(select 1 from tickets t where o.name=any(t.photos) or o.bucket_id||':'||o.name=any(t.photos))
        and not exists(select 1 from notices n where o.name=any(n.attachments) or o.bucket_id||':'||o.name=any(n.attachments))
        and not exists(select 1 from polls p where o.name=any(p.attachments) or o.bucket_id||':'||o.name=any(p.attachments))
        and not exists(select 1 from export_artifacts a where a.storage_path=o.name and a.status in ('pending','ready'))
        and o.created_at<now()-interval '24 hours'
      order by o.created_at limit least(greatest(coalesce(p_limit,200),1),1000)
    ) o
  ),'[]'::jsonb);
end $$;

revoke all on table admin_audit_events,flat_import_jobs,export_artifacts,
  personal_data_export_requests,account_deletion_requests,privacy_legal_holds,
  admin_export_jobs,cleanup_job_runs from anon,authenticated;
grant select on admin_audit_events,flat_import_jobs,export_artifacts,
  personal_data_export_requests,account_deletion_requests,privacy_legal_holds,
  admin_export_jobs,cleanup_job_runs to authenticated;
revoke all on function admin_dataset_page(text,integer,jsonb,text,jsonb) from public;
revoke all on function admin_audit_page(integer,jsonb,text,text,text) from public;
revoke all on function import_flats_transactional(text,jsonb,boolean,boolean) from public;
revoke all on function raise_dues_for_all_flats(text,numeric) from public;
revoke all on function request_personal_data_export() from public;
revoke all on function request_account_deletion_internal(text,integer) from public;
revoke all on function request_account_deletion() from public;
revoke all on function request_account_deletion_for(text,integer) from public;
revoke all on function cancel_account_deletion() from public;
revoke all on function create_admin_audit_export(text,jsonb) from public;
revoke all on function set_privacy_legal_hold(text,text,text,boolean) from public;
revoke all on function build_personal_export_snapshot(text) from public;
revoke all on function run_privacy_retention_cleanup(integer,boolean) from public;
revoke all on function list_orphan_media(integer) from public;
grant execute on function admin_dataset_page(text,integer,jsonb,text,jsonb) to authenticated;
grant execute on function admin_audit_page(integer,jsonb,text,text,text) to authenticated;
grant execute on function import_flats_transactional(text,jsonb,boolean,boolean) to authenticated;
grant execute on function raise_dues_for_all_flats(text,numeric) to authenticated;
grant execute on function request_personal_data_export() to authenticated;
grant execute on function request_account_deletion() to authenticated;
grant execute on function request_account_deletion_for(text,integer) to service_role;
grant execute on function cancel_account_deletion() to authenticated;
grant execute on function create_admin_audit_export(text,jsonb) to authenticated;
grant execute on function set_privacy_legal_hold(text,text,text,boolean) to authenticated;
grant execute on function build_personal_export_snapshot(text) to service_role;
grant execute on function run_privacy_retention_cleanup(integer,boolean) to service_role;
grant execute on function list_orphan_media(integer) to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule(
      'portl-privacy-retention-v0023','17 * * * *',
      'select public.run_privacy_retention_cleanup(500,true);'
    );
  end if;
exception when others then
  raise notice 'Privacy retention schedule not installed: %',sqlerrm;
end $$;
