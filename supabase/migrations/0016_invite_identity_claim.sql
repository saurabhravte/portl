-- 0016: Dual-identity invite claim overload used by the Expo auth client.
-- Verified phone/email still come only from JWT claims (never trust client input).

alter table invites add column if not exists identity_type text
  check (identity_type is null or identity_type in ('phone', 'email'));
alter table invites add column if not exists identity_value text;

-- Backfill identity columns from legacy phone/email fields.
update invites
   set identity_type = coalesce(
         identity_type,
         case
           when phone is not null then 'phone'
           when email is not null then 'email'
           else null
         end
       ),
       identity_value = coalesce(
         identity_value,
         case
           when phone is not null then phone
           when email is not null then lower(trim(email))
           else null
         end
       )
 where identity_type is null or identity_value is null;

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
  normalized_phone text;
  inv record;
begin
  if caller_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from profiles where id = caller_id) then
    raise exception 'profile already exists';
  end if;

  -- Client args are hints only. Authorization uses verified JWT claims.
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

  if p_identity_type = 'phone' and length(normalized_phone) = 10 then
    if right(regexp_replace(coalesce(p_identity_value, ''), '\D', '', 'g'), 10)
       is distinct from normalized_phone then
      raise exception 'invite identity does not match verified phone'
        using errcode = '42501';
    end if;
  elsif p_identity_type = 'email' and verified_email is not null then
    if lower(trim(coalesce(p_identity_value, ''))) is distinct from verified_email then
      raise exception 'invite identity does not match verified email'
        using errcode = '42501';
    end if;
  end if;

  select * into inv
    from invites
   where claimed_at is null
     and (
       (
         length(normalized_phone) = 10
         and (
           (
             phone is not null
             and right(regexp_replace(phone, '\D', '', 'g'), 10) = normalized_phone
           )
           or (
             identity_type = 'phone'
             and identity_value is not null
             and right(regexp_replace(identity_value, '\D', '', 'g'), 10) = normalized_phone
           )
         )
       )
       or (
         verified_email is not null
         and (
           (email is not null and lower(trim(email)) = verified_email)
           or (
             identity_type = 'email'
             and identity_value is not null
             and lower(trim(identity_value)) = verified_email
           )
         )
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

revoke all on function claim_invite(text, text, text) from public;
grant execute on function claim_invite(text, text, text) to authenticated;
