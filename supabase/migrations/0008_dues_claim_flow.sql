-- 0008: Dues integrity — replace resident self-mark-paid with a two-step
-- "payment claimed → admin confirmed" flow (review §3 / sprint ticket #3).
--
-- Residents can no longer flip a due straight to 'paid'. They record a
-- payment claim ('claimed'); an admin confirms it to 'paid' (or reverts
-- it to 'due'). The society's books are only ever closed by an admin.

-- 1. New status value
alter table maintenance_dues drop constraint if exists maintenance_dues_status_check;
alter table maintenance_dues
  add constraint maintenance_dues_status_check
  check (status in ('due','claimed','paid','waived'));

alter table maintenance_dues
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text references profiles(id),
  add column if not exists confirmed_by text references profiles(id);

-- 2. Remove the honor-system policy from 0005
drop policy if exists dues_resident_pay on maintenance_dues;

-- Residents may only move their own flat's due from 'due' to 'claimed'.
create policy dues_resident_claim on maintenance_dues for update
  using (my_role() = 'resident' and flat_id = my_flat() and status = 'due')
  with check (flat_id = my_flat() and status = 'claimed');

-- (Admins keep full control through the existing dues_admin policy.)

-- 3. Notifications: claim → admins; confirmation → flat residents.
create or replace function on_due_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = new.status then return new; end if;

  if new.status = 'claimed' then
    perform notify_society_role(
      new.society_id,
      'admin',
      'dues_claimed',
      jsonb_build_object(
        'title', 'Payment claimed for ' || new.period,
        'body', 'Flat claims ₹' || trim(to_char(new.amount, '9999990.00'))
                || ' paid' || coalesce(' — ' || new.payment_note, '')
                || '. Confirm it in Manage → Dues.',
        'url', '/(admin)/manage',
        'dueId', new.id
      )
    );
  elsif old.status = 'claimed' and new.status = 'paid' then
    perform notify_flat_residents(
      new.flat_id,
      'dues',
      jsonb_build_object(
        'title', 'Payment confirmed for ' || new.period,
        'body', '₹' || trim(to_char(new.amount, '9999990.00'))
                || ' received. Thank you!',
        'url', '/(resident)/community',
        'dueId', new.id
      )
    );
  elsif old.status = 'claimed' and new.status = 'due' then
    perform notify_flat_residents(
      new.flat_id,
      'dues',
      jsonb_build_object(
        'title', 'Payment claim for ' || new.period || ' could not be verified',
        'body', 'Please contact the society office or claim again with a payment reference.',
        'url', '/(resident)/community',
        'dueId', new.id
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_due_status_change on maintenance_dues;
create trigger trg_due_status_change
  after update of status on maintenance_dues
  for each row execute function on_due_status_change();
