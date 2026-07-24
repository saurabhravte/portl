-- 0037_profile_contact_phone.sql
-- Allow authenticated users to set their contact phone via update_my_profile.
-- Phone is profile/contact data only — never a Portl sign-in method.

create or replace function enforce_profile_update_scope() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Security-definer RPCs can opt in for a single statement.
  if nullif(current_setting('portl.allow_profile_contact_update', true), '') = 'on' then
    return new;
  end if;

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

create or replace function update_my_profile(
  p_name text default null,
  p_expo_push_token text default null,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  updated profiles;
  next_phone text;
begin
  if caller_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  if p_phone is null then
    next_phone := null; -- leave unchanged (handled in SET below)
  elsif btrim(p_phone) = '' then
    next_phone := '';
  elsif p_phone ~ '^\+[1-9][0-9]{7,14}$' then
    next_phone := p_phone;
  else
    raise exception 'invalid phone number' using errcode = '22023';
  end if;

  perform set_config('portl.allow_profile_contact_update', 'on', true);

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
         end,
         phone = case
           when p_phone is null then phone
           when next_phone = '' then null
           else next_phone
         end
   where id = caller_id
   returning * into updated;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', updated.id,
    'name', updated.name,
    'phone', updated.phone,
    'expo_push_token', updated.expo_push_token
  );
end $$;

-- Drop old 2-arg overload if present, keep a single 3-arg signature.
drop function if exists update_my_profile(text, text);

revoke all on function update_my_profile(text, text, text) from public;
grant execute on function update_my_profile(text, text, text) to authenticated;
