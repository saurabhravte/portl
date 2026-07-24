-- 0019: Release-blocking security follow-up.
-- PostgreSQL INSERT policies evaluate WITH CHECK, so every administrative
-- FOR ALL policy must repeat the role requirement there.

drop policy if exists profiles_self_token on profiles;
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists towers_admin on towers;
create policy towers_admin on towers for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists flats_admin on flats;
create policy flats_admin on flats for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists pre_resident on pre_approvals;
create policy pre_resident on pre_approvals for all
  using (my_role() = 'resident' and flat_id = my_flat())
  with check (my_role() = 'resident' and flat_id = my_flat());

drop policy if exists tickets_resident on tickets;
create policy tickets_resident on tickets for all
  using (my_role() = 'resident' and flat_id = my_flat())
  with check (my_role() = 'resident' and flat_id = my_flat());

drop policy if exists tickets_admin on tickets;
create policy tickets_admin on tickets for all
  using (
    my_role() = 'admin'
    and exists (
      select 1 from flats f
      where f.id = flat_id and f.society_id = my_society()
    )
  )
  with check (
    my_role() = 'admin'
    and exists (
      select 1 from flats f
      where f.id = flat_id and f.society_id = my_society()
    )
  );

drop policy if exists notices_admin on notices;
create policy notices_admin on notices for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists invites_admin on invites;
create policy invites_admin on invites for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (
    my_role() = 'admin'
    and society_id = my_society()
    and created_by = clerk_uid()
  );

drop policy if exists polls_admin on polls;
create policy polls_admin on polls for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists amenities_admin on amenities;
create policy amenities_admin on amenities for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists staff_admin on staff;
create policy staff_admin on staff for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists dues_admin on maintenance_dues;
create policy dues_admin on maintenance_dues for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists bookings_admin_all on amenity_bookings;
create policy bookings_admin_all on amenity_bookings for all
  using (
    my_role() = 'admin'
    and exists (
      select 1 from amenities a
      where a.id = amenity_id and a.society_id = my_society()
    )
  )
  with check (
    my_role() = 'admin'
    and exists (
      select 1 from amenities a
      where a.id = amenity_id and a.society_id = my_society()
    )
  );

drop policy if exists service_providers_admin on service_providers;
create policy service_providers_admin on service_providers for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists gates_admin on gates;
create policy gates_admin on gates for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

drop policy if exists guard_shifts_admin on guard_shifts;
create policy guard_shifts_admin on guard_shifts for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (my_role() = 'admin' and society_id = my_society());

-- One user may receive notifications on multiple signed-in devices.
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table push_tokens enable row level security;
create policy push_tokens_self on push_tokens for select
  using (user_id = clerk_uid());
create policy push_tokens_self_delete on push_tokens for delete
  using (user_id = clerk_uid());

insert into push_tokens (user_id, token, platform)
select id, expo_push_token, 'android'
  from profiles
 where expo_push_token is not null
on conflict (token) do nothing;

create or replace function register_push_token(
  p_token text,
  p_platform text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if clerk_uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$'
     or p_platform not in ('android', 'ios', 'web') then
    raise exception 'invalid push token' using errcode = '22023';
  end if;

  insert into push_tokens (user_id, token, platform, last_seen_at)
  values (clerk_uid(), p_token, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        last_seen_at = now();
end $$;
revoke all on function register_push_token(text, text) from public;
grant execute on function register_push_token(text, text) to authenticated;

-- Expo ticket IDs are persisted for a scheduled receipt worker. The table is
-- service-role only: no client RLS policies are intentionally defined.
create table if not exists push_tickets (
  ticket_id text primary key,
  expo_push_token text not null,
  status text not null default 'pending'
    check (status in ('pending', 'ok', 'error')),
  receipt_error text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table push_tickets enable row level security;
create index if not exists push_tickets_pending_idx
  on push_tickets (next_attempt_at)
  where status = 'pending';

-- Invitations use canonical E.164/email matches and expire automatically.
alter table invites
  add column if not exists expires_at timestamptz not null
  default (now() + interval '30 days');

create or replace function claim_invite(
  p_identity_type text,
  p_identity_value text,
  p_name text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  claims jsonb := auth.jwt();
  verified_phone text;
  verified_email text;
  matched_count integer;
  inv record;
begin
  if caller_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from profiles where id = caller_id) then
    raise exception 'profile already exists';
  end if;

  if lower(coalesce(claims->>'phone_number_verified', 'false')) = 'true'
     and coalesce(claims->>'phone_number', '') ~ '^\+[1-9][0-9]{7,14}$' then
    verified_phone := claims->>'phone_number';
  end if;
  if lower(coalesce(claims->>'email_verified', 'false')) = 'true' then
    verified_email := nullif(lower(trim(claims->>'email')), '');
  end if;

  if verified_phone is null and verified_email is null then
    raise exception 'a verified E.164 phone number or email claim is required'
      using errcode = '28000';
  end if;
  if p_identity_type = 'phone'
     and (
       verified_phone is null
       or trim(coalesce(p_identity_value, '')) is distinct from verified_phone
     ) then
    raise exception 'invite identity does not match verified phone'
      using errcode = '42501';
  elsif p_identity_type = 'email'
     and (
       verified_email is null
       or lower(trim(coalesce(p_identity_value, ''))) is distinct from verified_email
     ) then
    raise exception 'invite identity does not match verified email'
      using errcode = '42501';
  elsif p_identity_type not in ('phone', 'email') then
    raise exception 'unsupported invite identity type' using errcode = '22023';
  end if;

  select count(*) into matched_count
    from invites
   where claimed_at is null
     and expires_at > now()
     and (
       (p_identity_type = 'phone' and verified_phone is not null
         and regexp_replace(
           coalesce(identity_value, phone, ''),
           '[^0-9+]',
           '',
           'g'
         ) = verified_phone)
       or
       (p_identity_type = 'email' and verified_email is not null
         and lower(trim(coalesce(identity_value, email))) = verified_email)
     );
  if matched_count > 1 then
    raise exception 'multiple active invitations exist for this identity'
      using errcode = 'P0001';
  end if;

  select * into inv
    from invites
   where claimed_at is null
     and expires_at > now()
     and (
       (p_identity_type = 'phone' and verified_phone is not null
         and regexp_replace(
           coalesce(identity_value, phone, ''),
           '[^0-9+]',
           '',
           'g'
         ) = verified_phone)
       or
       (p_identity_type = 'email' and verified_email is not null
         and lower(trim(coalesce(identity_value, email))) = verified_email)
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

revoke all on function claim_invite(text, text, text) from public;
grant execute on function claim_invite(text, text, text) to authenticated;
drop function if exists claim_invite(text, text);

-- A private bucket must never expose every society attachment to every member.
-- Guards/admins may read visitor media; residents may read media linked to
-- their own flat. Ticket media follows ticket visibility.
drop policy if exists society_media_read on storage.objects;
create policy society_media_read on storage.objects for select using (
  bucket_id = 'society-media'
  and (storage.foldername(name))[1] = my_society()::text
  and (
    left(
      (storage.foldername(name))[3],
      length(clerk_uid()) + 1
    ) = clerk_uid() || '-'
    or (
      (storage.foldername(name))[2] = 'visitors'
      and (
        my_role() in ('guard', 'admin')
        or exists (
          select 1 from visitors v
          where v.flat_id = my_flat()
            and v.society_id = my_society()
            and v.photo_url in (name, 'society-media:' || name)
        )
      )
    )
    or (
      (storage.foldername(name))[2] = 'tickets'
      and (
        my_role() = 'admin'
        or exists (
          select 1 from tickets t
          where t.flat_id = my_flat()
            and (
              name = any(t.photos)
              or 'society-media:' || name = any(t.photos)
            )
        )
      )
    )
  )
);

-- Serialize code attempts per guard so parallel guesses cannot bypass the
-- five-attempt window. Also reject revoked passes before attempting entry.
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

  perform pg_advisory_xact_lock(hashtextextended(caller_id, 0));

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
     and pre.revoked_at is null
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
