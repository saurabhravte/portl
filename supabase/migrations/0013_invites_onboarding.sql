-- 0013: Invite-by-phone onboarding (review §5.3/§5.5, sprint ticket #11)
-- and household members (ticket #18).
--
-- Replaces "edit seed.sql with real Clerk IDs" onboarding:
--   1. Admin creates an invite (phone, role, flat). Residents may also
--      invite family members to their own flat (household members).
--   2. The invitee signs up in Clerk with that phone number (Clerk verifies
--      it via OTP, so the phone is trusted).
--   3. On first sign-in, the app calls claim_invite() which creates the
--      profile row pre-linked to the right society/role/flat.

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  phone text not null,                   -- as entered; matched on last 10 digits
  name text,
  role text not null default 'resident' check (role in ('resident','guard','admin')),
  flat_id uuid references flats(id) on delete cascade,
  created_by text not null references profiles(id),
  created_at timestamptz not null default now(),
  claimed_by text references profiles(id),
  claimed_at timestamptz
);
create index if not exists invites_phone_idx on invites (right(regexp_replace(phone, '\D', '', 'g'), 10));

alter table invites enable row level security;

-- Admins manage all invites in their society.
create policy invites_admin on invites for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (society_id = my_society());

-- Residents can invite household members (resident role, own flat only)
-- and see their own flat's invites.
create policy invites_resident_read on invites for select
  using (my_role() = 'resident' and flat_id = my_flat());
create policy invites_resident_household on invites for insert with check (
  my_role() = 'resident'
  and society_id = my_society()
  and role = 'resident'
  and flat_id = my_flat()
  and created_by = clerk_uid()
);

-- Claim an invite on first sign-in. p_phone must come from a
-- Clerk-verified phone number (the client passes user.primaryPhoneNumber,
-- which Clerk has already OTP-verified).
create or replace function claim_invite(p_phone text, p_name text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_id text := clerk_uid();
  normalized text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  inv record;
begin
  if caller_id is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from profiles where id = caller_id) then
    raise exception 'profile already exists';
  end if;
  if length(normalized) < 10 then
    raise exception 'a verified phone number is required to claim an invite';
  end if;

  select * into inv
    from invites
   where claimed_at is null
     and right(regexp_replace(phone, '\D', '', 'g'), 10) = normalized
   order by created_at
   limit 1
   for update skip locked;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  insert into profiles (id, society_id, role, flat_id, name, phone)
  values (
    caller_id,
    inv.society_id,
    inv.role,
    inv.flat_id,
    coalesce(nullif(trim(coalesce(p_name, '')), ''), inv.name, 'New member'),
    p_phone
  );

  update invites
     set claimed_by = caller_id, claimed_at = now()
   where id = inv.id;

  return jsonb_build_object('claimed', true, 'role', inv.role);
end $$;

revoke all on function claim_invite(text, text) from public;
grant execute on function claim_invite(text, text) to authenticated;
