-- 0010: Poll voting is one-per-FLAT, not one-per-resident (review §4,
-- sprint ticket #10). Societies govern by unit: a three-member flat gets
-- one vote. voter_id is retained for audit ("who cast the flat's vote").

-- 1. Add flat_id and backfill from the voter's profile.
alter table poll_votes add column if not exists flat_id uuid references flats(id) on delete cascade;

update poll_votes pv
   set flat_id = p.flat_id
  from profiles p
 where p.id = pv.voter_id
   and pv.flat_id is null;

-- Votes from residents with no flat cannot be keyed to a unit — drop them.
delete from poll_votes where flat_id is null;

alter table poll_votes alter column flat_id set not null;

-- 2. If two members of the same flat had both voted under the old model,
-- keep only the earliest vote per (poll, flat) before tightening the key.
delete from poll_votes pv
 using poll_votes newer
 where pv.poll_id = newer.poll_id
   and pv.flat_id = newer.flat_id
   and pv.created_at > newer.created_at;

-- 3. Re-key: one row per (poll, flat).
alter table poll_votes drop constraint if exists poll_votes_pkey;
alter table poll_votes add primary key (poll_id, flat_id);

-- 4. Insert policy now requires voting for your own flat.
drop policy if exists votes_insert on poll_votes;
create policy votes_insert on poll_votes for insert with check (
  voter_id = clerk_uid()
  and my_role() = 'resident'
  and flat_id = my_flat()
  and exists (select 1 from polls p
              where p.id = poll_id
                and p.society_id = my_society()
                and p.closes_at > now())
);
