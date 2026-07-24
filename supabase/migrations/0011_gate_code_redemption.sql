-- 0011: Gate-code redemption hardening (review §4/§5.4, sprint ticket #13).
--
-- Previously the guard client did three sequential writes (insert visitor,
-- insert gate_log, burn code) with no transaction, and a 6-digit code space
-- could be brute-forced with unlimited tries. This migration moves the whole
-- redemption into one atomic security-definer RPC and rate-limits attempts
-- per guard.

create table if not exists gate_code_attempts (
  id uuid primary key default gen_random_uuid(),
  guard_id text not null references profiles(id) on delete cascade,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists gate_code_attempts_guard_idx
  on gate_code_attempts (guard_id, attempted_at desc);

-- No client access: only the definer function reads/writes attempts.
alter table gate_code_attempts enable row level security;

create or replace function redeem_gate_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  caller record;
  pa record;
  recent_failures integer;
  v_visitor_id uuid;
  v_log_id uuid;
begin
  if caller_id is null then
    raise exception 'not signed in';
  end if;

  select id, role, society_id into caller from profiles where id = caller_id;
  if not found or caller.role not in ('guard','admin') then
    raise exception 'only guards can redeem gate codes';
  end if;

  -- Rate limit: max 5 failed attempts per guard per 10 minutes.
  select count(*) into recent_failures
    from gate_code_attempts
   where guard_id = caller_id
     and success = false
     and attempted_at > now() - interval '10 minutes';
  if recent_failures >= 5 then
    raise exception 'Too many wrong codes. Wait 10 minutes or ask the resident to resend.';
  end if;

  if p_code !~ '^[0-9]{6}$' then
    insert into gate_code_attempts (guard_id, success) values (caller_id, false);
    raise exception 'The gate code is always 6 digits.';
  end if;

  -- Lock the pass row so two guards can't burn the same code concurrently.
  select pre.id, pre.visitor_name, pre.type, pre.flat_id, f.number as flat_number, f.society_id
    into pa
    from pre_approvals pre
    join flats f on f.id = pre.flat_id
   where pre.code = p_code
     and pre.used_at is null
     and pre.valid_from <= now()
     and pre.valid_to >= now()
     and f.society_id = caller.society_id
   for update of pre skip locked;

  if not found then
    insert into gate_code_attempts (guard_id, success) values (caller_id, false);
    raise exception 'Code not valid. Check the digits or ask the resident to resend.';
  end if;

  -- Atomic: visitor + gate log + burn the code, all-or-nothing.
  insert into visitors (society_id, flat_id, type, name)
  values (caller.society_id, pa.flat_id, pa.type, pa.visitor_name)
  returning id into v_visitor_id;

  insert into gate_logs (visitor_id, entry_at, entry_guard_id, method)
  values (v_visitor_id, now(), caller_id, 'pre_approved')
  returning id into v_log_id;

  update pre_approvals set used_at = now() where id = pa.id;

  insert into gate_code_attempts (guard_id, success) values (caller_id, true);

  perform notify_flat_residents(
    pa.flat_id,
    'visitor_decision',
    jsonb_build_object(
      'title', pa.visitor_name || ' has arrived',
      'body', 'Gate pass verified — entry logged at the gate.',
      'url', '/(resident)/history',
      'gateLogId', v_log_id
    )
  );

  return jsonb_build_object(
    'visitor_name', pa.visitor_name,
    'type', pa.type,
    'flat_number', pa.flat_number,
    'gate_log_id', v_log_id
  );
end $$;

revoke all on function redeem_gate_code(text) from public;
grant execute on function redeem_gate_code(text) to authenticated;
