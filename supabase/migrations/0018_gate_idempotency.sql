-- 0018: Reliable, tenant-safe and idempotent gate operations.

create table gate_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  actor_id text not null references profiles(id) on delete cascade,
  society_id uuid not null references societies(id) on delete cascade,
  operation text not null check (
    operation in ('raise_visitor', 'retry_request', 'decide_request',
                  'mark_entry', 'mark_exit', 'admin_override')
  ),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_id, idempotency_key)
);
create index gate_operations_society_idx
  on gate_operations(society_id, created_at desc);
alter table gate_operations enable row level security;
revoke all on table gate_operations from anon, authenticated;

-- A client key is claimed before any mutation. Concurrent calls with the same
-- actor/key block on the unique index and then return the committed result.

drop function if exists raise_visitor_request(uuid,text,text,text,text,text);
create function raise_visitor_request(
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
    response := jsonb_build_object('requestId',existing.id,'status',existing.status,'duplicate',true);
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
      'duplicate',false
    );
  end if;
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

create function retry_visitor_request(
  p_idempotency_key uuid, p_visitor_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller profiles; claimed_id uuid; prior record; latest record; request_id uuid; response jsonb;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role not in ('guard','admin') then raise exception 'only gate staff can retry requests' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required' using errcode='22023'; end if;
  select r.id,r.status into latest
    from visitor_requests r join visitors v on v.id=r.visitor_id
   where v.id=p_visitor_id and v.society_id=caller.society_id
   order by r.created_at desc limit 1 for update of r;
  if not found then raise exception 'visitor not found in your society' using errcode='42501'; end if;

  insert into gate_operations(idempotency_key,actor_id,society_id,operation)
  values(p_idempotency_key,caller.id,caller.society_id,'retry_request')
  on conflict(actor_id,idempotency_key) do nothing returning id into claimed_id;
  if claimed_id is null then
    select operation,result into prior from gate_operations where actor_id=caller.id and idempotency_key=p_idempotency_key;
    if prior.operation <> 'retry_request' then raise exception 'idempotency key reused for another operation' using errcode='22023'; end if;
    return prior.result;
  end if;
  if latest.status <> 'expired' then raise exception 'only an expired request can be retried' using errcode='23514'; end if;
  if exists(select 1 from gate_logs where visitor_id=p_visitor_id) then raise exception 'an admitted visitor cannot be retried' using errcode='23514'; end if;
  insert into visitor_requests(visitor_id,raised_by) values(p_visitor_id,caller.id) returning id into request_id;
  response := jsonb_build_object('requestId',request_id,'status',(select status from visitor_requests where id=request_id));
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

create function decide_visitor_request(
  p_idempotency_key uuid, p_request_id uuid, p_decision text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller profiles; claimed_id uuid; prior record; req record; response jsonb;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role<>'resident' or caller.flat_id is null then raise exception 'only linked residents can decide requests' using errcode='42501'; end if;
  if p_idempotency_key is null or p_decision not in ('approved','denied') then raise exception 'invalid decision' using errcode='22023'; end if;
  select r.id,r.status,v.flat_id,v.society_id into req
    from visitor_requests r join visitors v on v.id=r.visitor_id
   where r.id=p_request_id and v.society_id=caller.society_id and v.flat_id=caller.flat_id
   for update of r;
  if not found then raise exception 'request not found for your flat' using errcode='42501'; end if;

  insert into gate_operations(idempotency_key,actor_id,society_id,operation)
  values(p_idempotency_key,caller.id,caller.society_id,'decide_request')
  on conflict(actor_id,idempotency_key) do nothing returning id into claimed_id;
  if claimed_id is null then
    select operation,result into prior from gate_operations where actor_id=caller.id and idempotency_key=p_idempotency_key;
    if prior.operation <> 'decide_request' then raise exception 'idempotency key reused for another operation' using errcode='22023'; end if;
    return prior.result;
  end if;
  if req.status <> 'pending' then raise exception 'request already %',req.status using errcode='23514'; end if;
  update visitor_requests set status=p_decision,decided_by=caller.id,decided_at=now() where id=req.id;
  response := jsonb_build_object('ok',true,'requestId',req.id,'status',p_decision);
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

create function mark_visitor_entry(
  p_idempotency_key uuid, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller profiles; claimed_id uuid; prior record; req record; log_id uuid; response jsonb;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role not in ('guard','admin') then raise exception 'only gate staff can mark entry' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required' using errcode='22023'; end if;
  select r.status,v.id visitor_id,v.society_id into req
    from visitor_requests r join visitors v on v.id=r.visitor_id
   where r.id=p_request_id and v.society_id=caller.society_id for update of r;
  if not found then raise exception 'request not found in your society' using errcode='42501'; end if;

  insert into gate_operations(idempotency_key,actor_id,society_id,operation)
  values(p_idempotency_key,caller.id,caller.society_id,'mark_entry')
  on conflict(actor_id,idempotency_key) do nothing returning id into claimed_id;
  if claimed_id is null then
    select operation,result into prior from gate_operations where actor_id=caller.id and idempotency_key=p_idempotency_key;
    if prior.operation <> 'mark_entry' then raise exception 'idempotency key reused for another operation' using errcode='22023'; end if;
    return prior.result;
  end if;
  if req.status<>'approved' then raise exception 'request is not approved' using errcode='23514'; end if;
  insert into gate_logs(visitor_id,entry_at,entry_guard_id,method)
  values(req.visitor_id,now(),caller.id,'approved') returning id into log_id;
  response := jsonb_build_object('gateLogId',log_id,'requestId',p_request_id);
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

create function mark_visitor_exit(
  p_idempotency_key uuid, p_log_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller profiles; claimed_id uuid; prior record; visit record; response jsonb;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role not in ('guard','admin') then raise exception 'only gate staff can mark exit' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required' using errcode='22023'; end if;
  select g.id,g.exit_at,v.society_id into visit from gate_logs g join visitors v on v.id=g.visitor_id
   where g.id=p_log_id and v.society_id=caller.society_id for update of g;
  if not found then raise exception 'gate log not found in your society' using errcode='42501'; end if;

  insert into gate_operations(idempotency_key,actor_id,society_id,operation)
  values(p_idempotency_key,caller.id,caller.society_id,'mark_exit')
  on conflict(actor_id,idempotency_key) do nothing returning id into claimed_id;
  if claimed_id is null then
    select operation,result into prior from gate_operations where actor_id=caller.id and idempotency_key=p_idempotency_key;
    if prior.operation <> 'mark_exit' then raise exception 'idempotency key reused for another operation' using errcode='22023'; end if;
    return prior.result;
  end if;
  if visit.exit_at is not null then raise exception 'visitor has already exited' using errcode='23514'; end if;
  update gate_logs set exit_at=greatest(now(),entry_at+interval '1 millisecond'),exit_guard_id=caller.id where id=p_log_id;
  response := jsonb_build_object('gateLogId',p_log_id,'exited',true);
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

drop function if exists admin_override_entry(uuid,text);
create function admin_override_entry(
  p_idempotency_key uuid, p_request_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller profiles; claimed_id uuid; prior record; req record; log_id uuid; response jsonb;
begin
  select * into caller from profiles where id=clerk_uid();
  if not found or caller.role<>'admin' then raise exception 'only society admins can override' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A reason (at least 5 characters) is required for an override.' using errcode='22023'; end if;
  select r.id,r.status,v.id visitor_id,v.name,v.flat_id into req
    from visitor_requests r join visitors v on v.id=r.visitor_id
   where r.id=p_request_id and v.society_id=caller.society_id for update of r;
  if not found then raise exception 'request not found in your society' using errcode='42501'; end if;

  insert into gate_operations(idempotency_key,actor_id,society_id,operation)
  values(p_idempotency_key,caller.id,caller.society_id,'admin_override')
  on conflict(actor_id,idempotency_key) do nothing returning id into claimed_id;
  if claimed_id is null then
    select operation,result into prior from gate_operations where actor_id=caller.id and idempotency_key=p_idempotency_key;
    if prior.operation <> 'admin_override' then raise exception 'idempotency key reused for another operation' using errcode='22023'; end if;
    return prior.result;
  end if;
  if req.status='pending' then
    update visitor_requests set status='approved',decided_by=caller.id,decided_at=now() where id=req.id;
  end if;
  if exists(select 1 from gate_logs where visitor_id=req.visitor_id) then raise exception 'visitor already has a gate entry' using errcode='23514'; end if;
  insert into gate_logs(visitor_id,entry_at,entry_guard_id,method,override_reason)
  values(req.visitor_id,now(),caller.id,'admin_override',trim(p_reason)) returning id into log_id;
  perform notify_flat_residents(req.flat_id,'visitor_decision',jsonb_build_object(
    'title',req.name||' let in by admin override','body','Reason: '||trim(p_reason),
    'url','/(resident)/history','gateLogId',log_id
  ));
  response := jsonb_build_object('gate_log_id',log_id,'visitor_name',req.name);
  update gate_operations set result=response,completed_at=now() where id=claimed_id;
  return response;
end $$;

revoke all on function raise_visitor_request(uuid,uuid,text,text,text,text,text) from public;
revoke all on function retry_visitor_request(uuid,uuid) from public;
revoke all on function decide_visitor_request(uuid,uuid,text) from public;
revoke all on function mark_visitor_entry(uuid,uuid) from public;
revoke all on function mark_visitor_exit(uuid,uuid) from public;
revoke all on function admin_override_entry(uuid,uuid,text) from public;
grant execute on function raise_visitor_request(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function retry_visitor_request(uuid,uuid) to authenticated;
grant execute on function decide_visitor_request(uuid,uuid,text) to authenticated;
grant execute on function mark_visitor_entry(uuid,uuid) to authenticated;
grant execute on function mark_visitor_exit(uuid,uuid) to authenticated;
grant execute on function admin_override_entry(uuid,uuid,text) to authenticated;
