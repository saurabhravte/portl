-- 0038_soft_invite_claim.sql
--
-- Phase 1.4 / 1.5 — remove the verification gate that blocked app entry.
--
-- SYMPTOM
--   Every user who signed in without a Clerk-verified email/phone hit a full
--   screen "Couldn't load your profile / a verified E.164 phone number or
--   email claim is required" with only "Try again" and "Sign out". Try again
--   re-ran the same doomed RPC, so the only real exit was Sign out. A raw
--   Postgres exception string was being rendered as the user-facing copy.
--
-- ROOT CAUSE
--   claim_invite() (0019_release_security_followup.sql) RAISES on three
--   separate non-exceptional conditions:
--     1. no verified phone/email claim in the JWT   -> errcode 28000
--     2. invite identity does not match the claim   -> errcode 42501
--     3. profile already exists                     -> unqualified raise
--   PostgREST turns any raise into a non-2xx, supabase-js returns it as
--   `error`, and the client's `if (claimError) setProfileFailed(...)` painted
--   the terminal error screen. Case 3 was the worst: a *successfully*
--   provisioned user re-running the bootstrap would be told their profile
--   could not load.
--
-- FIX
--   "Nothing to claim" is a normal outcome, not an error. claim_invite now
--   returns a discriminated result the client can branch on, and only raises
--   for genuinely exceptional states (not signed in, unsupported type,
--   ambiguous invite).
--
-- SECURITY — deliberately unchanged
--   The identity checks are IDENTICAL. An unverified caller still cannot
--   claim an invite, and a verified caller still cannot claim an invite
--   addressed to an identity they do not own. Only the *failure mode*
--   changed: soft `{claimed:false, reason:...}` instead of an exception.
--   Relaxing the match would let anyone claim any invite by guessing an
--   email, so it stays.

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
  -- Still exceptional: an unauthenticated caller should never reach here.
  if caller_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Previously `raise exception 'profile already exists'`. Re-running the
  -- bootstrap for a healthy user is idempotent, not an error.
  if exists (select 1 from profiles where id = caller_id) then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'already_linked'
    );
  end if;

  if lower(coalesce(claims->>'phone_number_verified', 'false')) = 'true'
     and coalesce(claims->>'phone_number', '') ~ '^\+[1-9][0-9]{7,14}$' then
    verified_phone := claims->>'phone_number';
  end if;
  if lower(coalesce(claims->>'email_verified', 'false')) = 'true' then
    verified_email := nullif(lower(trim(claims->>'email')), '');
  end if;

  -- The screenshotted failure. Now a soft state the client routes on.
  if verified_phone is null and verified_email is null then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'identity_unverified'
    );
  end if;

  if p_identity_type not in ('phone', 'email') then
    raise exception 'unsupported invite identity type' using errcode = '22023';
  end if;

  -- Identity must match a VERIFIED claim. Unchanged rule, soft result.
  if p_identity_type = 'phone'
     and (
       verified_phone is null
       or trim(coalesce(p_identity_value, '')) is distinct from verified_phone
     ) then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'identity_mismatch'
    );
  elsif p_identity_type = 'email'
     and (
       verified_email is null
       or lower(trim(coalesce(p_identity_value, ''))) is distinct from verified_email
     ) then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'identity_mismatch'
    );
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

  -- Genuinely ambiguous: refuse rather than pick a society at random.
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

  -- Verified, but nobody has invited them yet. Needs an admin, not an error.
  if not found then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'no_invite'
    );
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

  return jsonb_build_object(
    'claimed', true,
    'reason', 'claimed',
    'society_id', inv.society_id,
    'role', inv.role
  );
end $$;

revoke all on function claim_invite(text, text, text) from public;
grant execute on function claim_invite(text, text, text) to authenticated;

comment on function claim_invite(text, text, text) is
  'Claims a pending society invite for the calling Clerk user. Returns '
  '{claimed, reason} where reason is one of: claimed, already_linked, '
  'identity_unverified, identity_mismatch, no_invite. Only raises for '
  'unauthenticated callers, unsupported identity types, and ambiguous '
  'invites. Identity must match a VERIFIED JWT claim.';
