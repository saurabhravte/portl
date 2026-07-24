-- 0024: Correct runtime-safe pagination keys, flat import deduplication,
-- guard device validation, and authenticated table privileges used by RLS.

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
  resolved_tower_id uuid;
  created_towers integer := 0;
  created_flats integer := 0;
  job_id uuid;
  row_key text;
  seen_keys text[] := '{}'::text[];
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
    row_key := jsonb_build_array(normalized_tower,lower(flat_number))::text;
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
      select t.id into resolved_tower_id from towers t
        where t.society_id=caller.society_id
          and lower(regexp_replace(trim(t.name),'\s+',' ','g'))=normalized_tower
        order by t.id limit 1 for update;
      if resolved_tower_id is null then
        insert into towers(society_id,name) values(caller.society_id,tower_name)
          returning id into resolved_tower_id;
        created_towers:=created_towers+1;
      end if;
      insert into flats(society_id,tower_id,number)
        values(caller.society_id,resolved_tower_id,flat_number)
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

create or replace function assert_active_guard_device() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  caller profiles;
  request_device_id text;
begin
  select * into caller from profiles where id=clerk_uid();
  if caller.role<>'guard' then return new; end if;
  request_device_id := coalesce(
    (nullif(current_setting('request.headers',true),'')::jsonb)->>'x-portl-device-id',''
  );
  if not exists(
    select 1 from guard_device_sessions s
    where s.guard_id=caller.id and s.society_id=caller.society_id
      and s.device_id=request_device_id and s.status='active'
      and s.last_seen_at > now()-interval '10 minutes'
  ) then raise exception 'an active guard device session is required' using errcode='42501'; end if;
  return new;
end $$;

-- The due-time dispatcher supersedes the legacy immediate notice and poll
-- notification triggers.
drop trigger if exists trg_notice_published on notices;
drop trigger if exists trg_poll_insert on polls;

-- Permissive UPDATE policies combine their USING and WITH CHECK expressions
-- independently. Repeat the caller role and tenant scope in each check so a
-- guard cannot satisfy the staff USING clause and resident CHECK clause.
drop policy if exists requests_decide_resident on visitor_requests;
create policy requests_decide_resident on visitor_requests for update
  using (
    status = 'pending'
    and my_role() = 'resident'
    and exists (
      select 1 from visitors v
      where v.id = visitor_id
        and v.society_id = my_society()
        and v.flat_id = my_flat()
    )
  )
  with check (
    my_role() = 'resident'
    and status in ('approved', 'denied')
    and decided_by = clerk_uid()
    and decided_at is not null
    and exists (
      select 1 from visitors v
      where v.id = visitor_id
        and v.society_id = my_society()
        and v.flat_id = my_flat()
    )
  );

drop policy if exists requests_expire_staff on visitor_requests;
create policy requests_expire_staff on visitor_requests for update
  using (
    status = 'pending'
    and my_role() in ('guard', 'admin')
    and exists (
      select 1 from visitors v
      where v.id = visitor_id and v.society_id = my_society()
    )
  )
  with check (
    my_role() in ('guard', 'admin')
    and status = 'expired'
    and decided_by = clerk_uid()
    and decided_at is not null
    and exists (
      select 1 from visitors v
      where v.id = visitor_id and v.society_id = my_society()
    )
  );

drop policy if exists guard_sessions_admin_read on guard_device_sessions;
create policy guard_sessions_admin_read on guard_device_sessions for select
  using(my_role()='admin' and society_id=my_society());

-- Qualify the storage object name inside nested visitor queries. Without the
-- qualification, PostgreSQL binds "name" to visitors.name and linked media is
-- incorrectly hidden.
drop policy if exists society_media_read on storage.objects;
create policy society_media_read on storage.objects for select using (
  bucket_id = 'society-media'
  and array_length(string_to_array(storage.objects.name, '/'), 1) = 3
  and split_part(storage.objects.name, '/', 1) = my_society()::text
  and split_part(storage.objects.name, '/', 2) in ('visitors', 'tickets', 'notices', 'polls')
  and (
    my_role() = 'admin'
    or left(storage.filename(storage.objects.name), length(clerk_uid()) + 1) = clerk_uid() || '-'
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
        and t.flat_id=my_flat() and f.society_id=my_society()
        and (
          storage.objects.name=any(t.photos)
          or 'society-media:'||storage.objects.name=any(t.photos)
        )
    )
  )
);

-- Supabase table privileges are evaluated before RLS. Grant only the direct
-- authenticated operations supported by existing policies and app workflows.
grant select on societies, towers, flats, profiles, visitors, visitor_requests,
  gate_logs, pre_approvals, tickets, notices, notifications, maintenance_dues,
  polls, poll_votes, gate_code_attempts, service_providers, gates,
  guard_device_sessions
to authenticated;

grant insert on visitors, visitor_requests, gate_logs, pre_approvals, tickets,
  notices, notifications, poll_votes, service_providers, gates
to authenticated;

grant update on profiles, visitor_requests, gate_logs, pre_approvals, tickets,
  notices, maintenance_dues, polls
to authenticated;

grant delete on pre_approvals to authenticated;
