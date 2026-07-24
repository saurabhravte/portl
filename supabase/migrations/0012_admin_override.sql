-- 0012: Admin visitor override with a mandatory, audited reason
-- (review §4 "schema-only", sprint ticket #14).
--
-- An admin can let a visitor in even when the resident hasn't answered
-- (or the request expired). The reason is stored on the gate log and the
-- entry is surfaced in history with the admin_override badge.

alter table gate_logs add column if not exists override_reason text;

alter table gate_logs drop constraint if exists gate_logs_override_reason_required;
alter table gate_logs
  add constraint gate_logs_override_reason_required
  check (method <> 'admin_override' or length(trim(coalesce(override_reason, ''))) >= 5);

create or replace function admin_override_entry(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  caller record;
  req record;
  v_log_id uuid;
begin
  select id, role, society_id into caller from profiles where id = caller_id;
  if not found or caller.role <> 'admin' then
    raise exception 'only society admins can override';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason (at least 5 characters) is required for an override.';
  end if;

  select r.id, r.status, v.id as visitor_id, v.name, v.flat_id, v.society_id
    into req
    from visitor_requests r
    join visitors v on v.id = r.visitor_id
   where r.id = p_request_id
     and v.society_id = caller.society_id
   for update of r;
  if not found then
    raise exception 'request not found in your society';
  end if;

  -- Close out a still-pending request; expired/denied stay as they are —
  -- the override gate log is the audited record of what actually happened.
  if req.status = 'pending' then
    update visitor_requests
       set status = 'approved', decided_by = caller_id, decided_at = now()
     where id = req.id;
  end if;

  insert into gate_logs (visitor_id, entry_at, entry_guard_id, method, override_reason)
  values (req.visitor_id, now(), caller_id, 'admin_override', trim(p_reason))
  returning id into v_log_id;

  perform notify_flat_residents(
    req.flat_id,
    'visitor_decision',
    jsonb_build_object(
      'title', req.name || ' let in by admin override',
      'body', 'Reason: ' || trim(p_reason),
      'url', '/(resident)/history',
      'gateLogId', v_log_id
    )
  );

  return jsonb_build_object('gate_log_id', v_log_id, 'visitor_name', req.name);
end $$;

revoke all on function admin_override_entry(uuid, text) from public;
grant execute on function admin_override_entry(uuid, text) to authenticated;
