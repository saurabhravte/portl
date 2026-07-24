-- 0015: Backend security hardening.
-- Forward-only fixes for profile mutation, tenant write isolation, private
-- media, invite identity, gate-code throttling, and webhook authentication.

-- ── Profile mutation: self-service fields are narrow and immutable identity
-- fields cannot be changed by editing a PostgREST payload.
create or replace function enforce_profile_update_scope() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.id = clerk_uid()
     and (
       new.id is distinct from old.id
       or new.society_id is distinct from old.society_id
       or new.role is distinct from old.role
       or new.flat_id is distinct from old.flat_id
       or new.phone is distinct from old.phone
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'self-service profile updates may only change name or push token'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_profile_update_scope on profiles;
create trigger trg_profile_update_scope
  before update on profiles
  for each row execute function enforce_profile_update_scope();

create or replace function update_my_profile(
  p_name text default null,
  p_expo_push_token text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  updated profiles;
begin
  if caller_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  update profiles
     set name = case
           when p_name is null then name
           when length(trim(p_name)) between 1 and 120 then trim(p_name)
           else name
         end,
         expo_push_token = case
           when p_expo_push_token is null then expo_push_token
           when p_expo_push_token = '' then null
           else p_expo_push_token
         end
   where id = caller_id
   returning * into updated;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', updated.id,
    'name', updated.name,
    'expo_push_token', updated.expo_push_token
  );
end $$;

revoke all on function update_my_profile(text, text) from public;
grant execute on function update_my_profile(text, text) to authenticated;

-- ── Visitor request transitions and tenant-scoped writes.
create or replace function enforce_request_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id
     or new.visitor_id is distinct from old.visitor_id
     or new.raised_by is distinct from old.raised_by
     or new.created_at is distinct from old.created_at then
    raise exception 'visitor request identity is immutable' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'request already %', old.status;
  end if;
  if new.status not in ('approved', 'denied', 'expired') then
    raise exception 'invalid transition';
  end if;
  if new.decided_at is null then
    raise exception 'decision timestamp is required';
  end if;
  return new;
end $$;

drop policy if exists requests_insert_guard on visitor_requests;
drop policy if exists requests_decide_resident on visitor_requests;
drop policy if exists requests_expire_guard on visitor_requests;

create policy requests_insert_guard on visitor_requests for insert
  with check (
    my_role() in ('guard', 'admin')
    and raised_by = clerk_uid()
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and exists (
      select 1 from visitors v
       where v.id = visitor_id
         and v.society_id = my_society()
    )
  );

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
    status in ('approved', 'denied')
    and decided_by = clerk_uid()
    and decided_at is not null
  );

create policy requests_expire_staff on visitor_requests for update
  using (
    status = 'pending'
    and my_role() in ('guard', 'admin')
    and exists (
      select 1 from visitors v
       where v.id = visitor_id
         and v.society_id = my_society()
    )
  )
  with check (
    status = 'expired'
    and decided_by = clerk_uid()
    and decided_at is not null
  );

-- A visitor row represents one visit, so it can have at most one entry.
create unique index if not exists gate_logs_one_entry_per_visitor
  on gate_logs (visitor_id);

create or replace function enforce_gate_log_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.exit_at is not null or new.exit_guard_id is not null then
      raise exception 'a gate entry cannot include an exit' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.visitor_id is distinct from old.visitor_id
     or new.entry_at is distinct from old.entry_at
     or new.entry_guard_id is distinct from old.entry_guard_id
     or new.method is distinct from old.method
     or new.override_reason is distinct from old.override_reason then
    raise exception 'gate entry fields are immutable' using errcode = '42501';
  end if;
  if old.exit_at is not null or old.exit_guard_id is not null then
    raise exception 'visitor has already exited';
  end if;
  if new.exit_at is null or new.exit_at <= old.entry_at or new.exit_guard_id is null then
    raise exception 'a legal exit requires a guard and a timestamp after entry';
  end if;
  return new;
end $$;

drop trigger if exists trg_gate_log_transition on gate_logs;
create trigger trg_gate_log_transition
  before insert or update on gate_logs
  for each row execute function enforce_gate_log_transition();

drop policy if exists gate_write on gate_logs;
drop policy if exists gate_update on gate_logs;

create policy gate_write on gate_logs for insert with check (
  my_role() in ('guard', 'admin')
  and entry_guard_id = clerk_uid()
  and method = 'approved'
  and override_reason is null
  and exists (
    select 1
      from visitors v
      join visitor_requests r on r.visitor_id = v.id
     where v.id = visitor_id
       and v.society_id = my_society()
       and r.status = 'approved'
  )
);

create policy gate_update on gate_logs for update
  using (
    my_role() in ('guard', 'admin')
    and exit_at is null
    and exists (
      select 1 from visitors v
       where v.id = visitor_id
         and v.society_id = my_society()
    )
  )
  with check (
    exit_at is not null
    and exit_guard_id = clerk_uid()
    and exists (
      select 1 from visitors v
       where v.id = visitor_id
         and v.society_id = my_society()
    )
  );

-- Pre-approvals are created by residents for their own flat. Redemption is
-- only through redeem_gate_code(), not a broad client UPDATE policy.
drop policy if exists pre_resident on pre_approvals;
drop policy if exists pre_guard_read on pre_approvals;
drop policy if exists pre_guard_redeem on pre_approvals;

create policy pre_resident_read on pre_approvals for select using (
  my_role() = 'resident' and flat_id = my_flat()
);
create policy pre_resident_insert on pre_approvals for insert with check (
  my_role() = 'resident'
  and flat_id = my_flat()
  and created_by = clerk_uid()
  and used_at is null
  and exists (
    select 1 from flats f
     where f.id = flat_id
       and f.society_id = my_society()
  )
);
create policy pre_resident_delete on pre_approvals for delete using (
  my_role() = 'resident'
  and flat_id = my_flat()
  and created_by = clerk_uid()
  and used_at is null
);
create policy pre_staff_read on pre_approvals for select using (
  my_role() in ('guard', 'admin')
  and exists (
    select 1 from flats f
     where f.id = flat_id
       and f.society_id = my_society()
  )
);

-- ── Private tenant media. SELECT remains available to same-society members,
-- which is what Storage needs when creating or downloading signed URLs.
update storage.buckets
   set public = false
 where id = 'society-media';

drop policy if exists society_media_read on storage.objects;
drop policy if exists society_media_insert on storage.objects;
drop policy if exists society_media_update on storage.objects;
drop policy if exists society_media_delete on storage.objects;

create policy society_media_read on storage.objects for select using (
  bucket_id = 'society-media'
  and (storage.foldername(name))[1] = my_society()::text
);
create policy society_media_insert on storage.objects for insert with check (
  bucket_id = 'society-media'
  and (storage.foldername(name))[1] = my_society()::text
  and (storage.foldername(name))[2] in ('visitors', 'tickets')
  and left(
    (storage.foldername(name))[3],
    length(clerk_uid()) + 1
  ) = clerk_uid() || '-'
);
create policy society_media_update on storage.objects for update
  using (
    bucket_id = 'society-media'
    and (storage.foldername(name))[1] = my_society()::text
    and (
      my_role() = 'admin'
      or left((storage.foldername(name))[3], length(clerk_uid()) + 1) = clerk_uid() || '-'
    )
  )
  with check (
    bucket_id = 'society-media'
    and (storage.foldername(name))[1] = my_society()::text
    and (
      my_role() = 'admin'
      or left((storage.foldername(name))[3], length(clerk_uid()) + 1) = clerk_uid() || '-'
    )
  );
create policy society_media_delete on storage.objects for delete using (
  bucket_id = 'society-media'
  and (storage.foldername(name))[1] = my_society()::text
  and (
    my_role() = 'admin'
    or left((storage.foldername(name))[3], length(clerk_uid()) + 1) = clerk_uid() || '-'
  )
);

-- ── Invite claiming trusts only verified identity claims in the signed JWT.
-- The old p_phone argument remains for client compatibility but is ignored.
alter table profiles add column if not exists email text;
alter table invites alter column phone drop not null;
alter table invites add column if not exists email text;
alter table invites drop constraint if exists invites_identity_required;
alter table invites add constraint invites_identity_required
  check (
    nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') is not null
    or nullif(lower(trim(coalesce(email, ''))), '') is not null
  );
create index if not exists invites_email_idx
  on invites (lower(trim(email)))
  where email is not null;

create or replace function claim_invite(p_phone text, p_name text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  claims jsonb := auth.jwt();
  verified_phone text;
  verified_email text;
  normalized_phone text;
  inv record;
begin
  if caller_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from profiles where id = caller_id) then
    raise exception 'profile already exists';
  end if;

  if lower(coalesce(claims->>'phone_number_verified', 'false')) = 'true' then
    verified_phone := nullif(claims->>'phone_number', '');
  end if;
  if lower(coalesce(claims->>'email_verified', 'false')) = 'true' then
    verified_email := nullif(lower(trim(claims->>'email')), '');
  end if;
  normalized_phone := right(
    regexp_replace(coalesce(verified_phone, ''), '\D', '', 'g'),
    10
  );

  if length(normalized_phone) < 10 and verified_email is null then
    raise exception 'a verified phone number or email claim is required'
      using errcode = '28000';
  end if;

  select * into inv
    from invites
   where claimed_at is null
     and (
       (
         length(normalized_phone) = 10
         and phone is not null
         and right(regexp_replace(phone, '\D', '', 'g'), 10) = normalized_phone
       )
       or (
         verified_email is not null
         and email is not null
         and lower(trim(email)) = verified_email
       )
     )
   order by created_at
   limit 1
   for update skip locked;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  insert into profiles (id, society_id, role, flat_id, name, phone, email)
  values (
    caller_id,
    inv.society_id,
    inv.role,
    inv.flat_id,
    coalesce(nullif(trim(coalesce(p_name, '')), ''), inv.name, 'New member'),
    verified_phone,
    verified_email
  );

  update invites
     set claimed_by = caller_id, claimed_at = now()
   where id = inv.id;

  return jsonb_build_object('claimed', true, 'role', inv.role);
end $$;

revoke all on function claim_invite(text, text) from public;
grant execute on function claim_invite(text, text) to authenticated;

-- ── Failed attempts must commit, so expected failures return data rather
-- than raising an exception that rolls the attempt row back.
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
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select id, role, society_id into caller from profiles where id = caller_id;
  if not found or caller.role not in ('guard', 'admin') then
    raise exception 'only guards can redeem gate codes' using errcode = '42501';
  end if;

  select count(*) into recent_failures
    from gate_code_attempts
   where guard_id = caller_id
     and success = false
     and attempted_at > now() - interval '10 minutes';
  if recent_failures >= 5 then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'message', 'Too many wrong codes. Wait 10 minutes or ask the resident to resend.'
    );
  end if;

  if coalesce(p_code, '') !~ '^[0-9]{6}$' then
    insert into gate_code_attempts (guard_id, success) values (caller_id, false);
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_format',
      'message', 'The gate code is always 6 digits.'
    );
  end if;

  select pre.id, pre.visitor_name, pre.type, pre.flat_id,
         f.number as flat_number, f.society_id
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
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_code',
      'message', 'Code not valid. Check the digits or ask the resident to resend.'
    );
  end if;

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
    'ok', true,
    'visitor_name', pa.visitor_name,
    'type', pa.type,
    'flat_number', pa.flat_number,
    'gate_log_id', v_log_id
  );
end $$;

revoke all on function redeem_gate_code(text) from public;
grant execute on function redeem_gate_code(text) to authenticated;

-- ── The notification webhook authenticates with a dedicated shared secret.
-- Never put the service-role key in an outbound request header.
create or replace function notify_push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  push_url text := current_setting('app.settings.send_push_url', true);
  webhook_secret text := current_setting('app.settings.send_push_secret', true);
begin
  if push_url is null or push_url = '' then
    return new;
  end if;
  if webhook_secret is null or webhook_secret = '' then
    raise warning 'send-push webhook secret is not configured; push skipped';
    return new;
  end if;

  perform net.http_post(
    url := push_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'table', 'notifications',
      'type', 'INSERT',
      'record', row_to_json(new)::jsonb
    )
  );
  return new;
end $$;

-- ── SECURITY DEFINER functions do not inherit executable access from PUBLIC.
revoke all on function my_role() from public;
revoke all on function my_society() from public;
revoke all on function my_flat() from public;
grant execute on function my_role() to authenticated;
grant execute on function my_society() to authenticated;
grant execute on function my_flat() to authenticated;

revoke all on function notify_user(text, text, jsonb) from public;
revoke all on function notify_flat_residents(uuid, text, jsonb) from public;
revoke all on function notify_society_role(uuid, text, text, jsonb) from public;
revoke all on function expire_stale_requests() from public;
revoke all on function auto_approve_visitor_request() from public;
revoke all on function on_visitor_request_insert() from public;
revoke all on function on_visitor_request_decide() from public;
revoke all on function on_notice_published() from public;
revoke all on function on_ticket_insert() from public;
revoke all on function on_ticket_status() from public;
revoke all on function on_poll_insert() from public;
revoke all on function on_due_insert() from public;
revoke all on function on_due_status_change() from public;
revoke all on function on_ticket_comment() from public;
revoke all on function on_ticket_assign() from public;
revoke all on function notify_push_on_notification() from public;

-- Explicitly retain access only for intentional client RPCs.
revoke all on function admin_override_entry(uuid, text) from public;
revoke all on function approval_time_stats(int) from public;
revoke all on function set_my_flat_auto_approve_optout(text[]) from public;
grant execute on function admin_override_entry(uuid, text) to authenticated;
grant execute on function approval_time_stats(int) to authenticated;
grant execute on function set_my_flat_auto_approve_optout(text[]) to authenticated;
