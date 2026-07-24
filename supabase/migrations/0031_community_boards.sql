-- 0031_community_boards.sql
-- Section 5 community backlog (excluding AI #51/#54):
-- anonymous audited polls (#55), lost & found (#56), marketplace (#57),
-- carpool (#58), events + RSVP (#59), society activity feed (#61).

-- ─────────────────────────────────────────────────────────────────────────
-- Shared activity feed
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists society_activity (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  kind text not null check (kind in (
    'notice', 'poll', 'lost_found', 'marketplace', 'carpool', 'event', 'feed_post'
  )),
  title text not null,
  body text,
  entity_id uuid,
  url text,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists society_activity_society_created_idx
  on society_activity (society_id, created_at desc);
alter table society_activity enable row level security;
create policy society_activity_read on society_activity for select
  using (society_id = my_society());
-- Inserts only via security-definer helpers / triggers.
create policy society_activity_no_direct_write on society_activity
  for insert with check (false);
create policy society_activity_no_direct_update on society_activity
  for update using (false);
create policy society_activity_admin_delete on society_activity for delete
  using (society_id = my_society() and my_role() = 'admin');

create or replace function emit_society_activity(
  p_society_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_entity_id uuid default null,
  p_url text default null,
  p_created_by text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into society_activity (
    society_id, kind, title, body, entity_id, url, created_by
  ) values (
    p_society_id, p_kind, p_title, nullif(btrim(coalesce(p_body, '')), ''),
    p_entity_id, p_url, p_created_by
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function emit_society_activity(uuid, text, text, text, uuid, text, text) from public;
grant execute on function emit_society_activity(uuid, text, text, text, uuid, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- #55 Anonymous / audited polls
-- ─────────────────────────────────────────────────────────────────────────
alter table polls
  add column if not exists is_anonymous boolean not null default false;

create table if not exists poll_vote_audit (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  poll_id uuid not null references polls(id) on delete cascade,
  voter_id text not null references profiles(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now()
);
create index if not exists poll_vote_audit_poll_idx on poll_vote_audit (poll_id, created_at desc);
alter table poll_vote_audit enable row level security;
create policy poll_vote_audit_admin_read on poll_vote_audit for select
  using (society_id = my_society() and my_role() = 'admin');
create policy poll_vote_audit_immutable on poll_vote_audit
  for update using (false);
create policy poll_vote_audit_no_delete on poll_vote_audit
  for delete using (false);

drop policy if exists votes_read on poll_votes;
-- Own vote always visible; full ballots only when poll is not anonymous
-- (admins always see ballots for moderation).
create policy votes_read on poll_votes for select using (
  exists (
    select 1 from polls p
    where p.id = poll_id
      and p.society_id = my_society()
      and (
        my_role() = 'admin'
        or voter_id = clerk_uid()
        or flat_id = my_flat()
        or p.is_anonymous = false
      )
  )
);

create or replace function poll_tallies(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_society uuid;
  v_counts int[];
  v_options jsonb;
  v_total int := 0;
  v_count int;
  i int;
begin
  select society_id, options into v_society, v_options
  from polls where id = p_poll_id;
  if not found or v_society is distinct from my_society() then
    raise exception 'poll not found' using errcode = '42501';
  end if;

  v_counts := array_fill(0, array[greatest(jsonb_array_length(v_options), 1)]);
  for i in 0 .. jsonb_array_length(v_options) - 1 loop
    select count(*)::int into v_count
    from poll_votes where poll_id = p_poll_id and option_index = i;
    v_counts[i + 1] := v_count;
    v_total := v_total + v_count;
  end loop;

  return jsonb_build_object(
    'pollId', p_poll_id,
    'total', v_total,
    'counts', to_jsonb(v_counts)
  );
end;
$$;
revoke all on function poll_tallies(uuid) from public;
grant execute on function poll_tallies(uuid) to authenticated;

create or replace function cast_poll_vote(p_poll_id uuid, p_option_index int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  poll polls;
  caller profiles;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'resident' or caller.flat_id is null then
    raise exception 'only linked residents can vote' using errcode = '42501';
  end if;
  select * into poll from polls where id = p_poll_id and society_id = caller.society_id for update;
  if not found then
    raise exception 'poll not found' using errcode = '42501';
  end if;
  if poll.closed_at is not null or poll.closes_at <= now() or poll.opens_at > now() then
    raise exception 'poll is not open' using errcode = '23514';
  end if;
  if p_option_index < 0 or p_option_index >= jsonb_array_length(poll.options) then
    raise exception 'invalid option' using errcode = '22023';
  end if;
  if exists (select 1 from poll_votes where poll_id = p_poll_id and flat_id = caller.flat_id) then
    raise exception 'flat already voted' using errcode = '23505';
  end if;

  insert into poll_votes (poll_id, voter_id, flat_id, option_index)
  values (p_poll_id, caller.id, caller.flat_id, p_option_index);

  insert into poll_vote_audit (society_id, poll_id, voter_id, flat_id, option_index)
  values (caller.society_id, p_poll_id, caller.id, caller.flat_id, p_option_index);
end;
$$;
revoke all on function cast_poll_vote(uuid, int) from public;
grant execute on function cast_poll_vote(uuid, int) to authenticated;

create or replace function on_poll_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform emit_society_activity(
    new.society_id, 'poll', new.question,
    case when new.is_anonymous then 'Anonymous ballot' else 'Society poll' end,
    new.id, '/(resident)/community?tab=polls', new.created_by
  );
  return new;
end $$;
drop trigger if exists trg_poll_activity on polls;
create trigger trg_poll_activity after insert on polls
  for each row execute function on_poll_activity();

-- ─────────────────────────────────────────────────────────────────────────
-- #56 Lost & Found
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists lost_found_items (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  flat_id uuid references flats(id) on delete set null,
  kind text not null check (kind in ('lost', 'found')),
  title text not null,
  description text,
  photo_ref text,
  location_note text,
  contact_note text,
  status text not null default 'open' check (status in ('open', 'claimed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lost_found_society_status_idx
  on lost_found_items (society_id, status, created_at desc);
alter table lost_found_items enable row level security;
create policy lost_found_read on lost_found_items for select
  using (society_id = my_society());
create policy lost_found_insert on lost_found_items for insert
  with check (
    society_id = my_society()
    and created_by = clerk_uid()
    and my_role() in ('resident', 'admin', 'guard')
  );
create policy lost_found_update on lost_found_items for update
  using (
    society_id = my_society()
    and (created_by = clerk_uid() or my_role() = 'admin')
  )
  with check (society_id = my_society());
create policy lost_found_delete on lost_found_items for delete
  using (society_id = my_society() and (created_by = clerk_uid() or my_role() = 'admin'));

create or replace function on_lost_found_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform emit_society_activity(
    new.society_id, 'lost_found',
    initcap(new.kind) || ': ' || new.title,
    left(coalesce(new.description, ''), 160),
    new.id, '/(resident)/community?tab=lost', new.created_by
  );
  perform notify_society_role(
    new.society_id, 'resident', 'lost_found',
    jsonb_build_object(
      'title', initcap(new.kind) || ' item posted',
      'body', new.title,
      'url', '/(resident)/community?tab=lost'
    )
  );
  return new;
end $$;
drop trigger if exists trg_lost_found_activity on lost_found_items;
create trigger trg_lost_found_activity after insert on lost_found_items
  for each row execute function on_lost_found_activity();

-- ─────────────────────────────────────────────────────────────────────────
-- #57 Community marketplace
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  flat_id uuid references flats(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'general'
    check (category in ('general', 'furniture', 'electronics', 'services', 'other')),
  price numeric(12, 2),
  photo_ref text,
  status text not null default 'active'
    check (status in ('active', 'sold', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_society_status_idx
  on marketplace_listings (society_id, status, created_at desc);
alter table marketplace_listings enable row level security;
create policy marketplace_read on marketplace_listings for select
  using (society_id = my_society() and (status <> 'removed' or created_by = clerk_uid() or my_role() = 'admin'));
create policy marketplace_insert on marketplace_listings for insert
  with check (
    society_id = my_society()
    and created_by = clerk_uid()
    and my_role() in ('resident', 'admin')
  );
create policy marketplace_update on marketplace_listings for update
  using (society_id = my_society() and (created_by = clerk_uid() or my_role() = 'admin'))
  with check (society_id = my_society());
create policy marketplace_delete on marketplace_listings for delete
  using (society_id = my_society() and (created_by = clerk_uid() or my_role() = 'admin'));

create or replace function on_marketplace_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' then
    perform emit_society_activity(
      new.society_id, 'marketplace', new.title,
      case when new.price is null then 'Free / negotiable'
           else '₹' || trim(to_char(new.price, '999999990.99')) end,
      new.id, '/(resident)/community?tab=market', new.created_by
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_marketplace_activity on marketplace_listings;
create trigger trg_marketplace_activity after insert on marketplace_listings
  for each row execute function on_marketplace_activity();

-- ─────────────────────────────────────────────────────────────────────────
-- #58 Car pool / ride-sharing
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists carpool_rides (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  flat_id uuid references flats(id) on delete set null,
  origin text not null,
  destination text not null,
  depart_at timestamptz not null,
  seats_total int not null check (seats_total between 1 and 8),
  seats_taken int not null default 0 check (seats_taken >= 0),
  notes text,
  vehicle_label text,
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  check (seats_taken <= seats_total)
);
create index if not exists carpool_rides_society_depart_idx
  on carpool_rides (society_id, depart_at);
alter table carpool_rides enable row level security;
create policy carpool_rides_read on carpool_rides for select
  using (society_id = my_society());
create policy carpool_rides_insert on carpool_rides for insert
  with check (
    society_id = my_society()
    and created_by = clerk_uid()
    and my_role() in ('resident', 'admin')
  );
create policy carpool_rides_update on carpool_rides for update
  using (society_id = my_society() and (created_by = clerk_uid() or my_role() = 'admin'))
  with check (society_id = my_society());

create table if not exists carpool_claims (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references carpool_rides(id) on delete cascade,
  society_id uuid not null references societies(id) on delete cascade,
  rider_id text not null references profiles(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  seats int not null default 1 check (seats between 1 and 4),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (ride_id, flat_id)
);
create index if not exists carpool_claims_ride_idx on carpool_claims (ride_id);
alter table carpool_claims enable row level security;
create policy carpool_claims_read on carpool_claims for select
  using (society_id = my_society());
create policy carpool_claims_insert on carpool_claims for insert
  with check (false); -- via RPC
create policy carpool_claims_update on carpool_claims for update
  using (society_id = my_society() and (rider_id = clerk_uid() or my_role() = 'admin'))
  with check (society_id = my_society());

create or replace function claim_carpool_seat(p_ride_id uuid, p_seats int default 1)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  ride carpool_rides;
  claim_id uuid;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('resident', 'admin') or caller.flat_id is null then
    raise exception 'linked resident required' using errcode = '42501';
  end if;
  if p_seats < 1 or p_seats > 4 then
    raise exception 'invalid seat count' using errcode = '22023';
  end if;

  select * into ride from carpool_rides
   where id = p_ride_id and society_id = caller.society_id
   for update;
  if not found then raise exception 'ride not found' using errcode = '42501'; end if;
  if ride.status <> 'open' then raise exception 'ride is not open' using errcode = '23514'; end if;
  if ride.created_by = caller.id then raise exception 'cannot claim your own ride' using errcode = '23514'; end if;
  if ride.seats_taken + p_seats > ride.seats_total then
    raise exception 'not enough seats' using errcode = '23514';
  end if;

  insert into carpool_claims (ride_id, society_id, rider_id, flat_id, seats)
  values (p_ride_id, caller.society_id, caller.id, caller.flat_id, p_seats)
  returning id into claim_id;

  update carpool_rides
     set seats_taken = seats_taken + p_seats,
         status = case when seats_taken + p_seats >= seats_total then 'full' else status end
   where id = p_ride_id;

  return claim_id;
end;
$$;
revoke all on function claim_carpool_seat(uuid, int) from public;
grant execute on function claim_carpool_seat(uuid, int) to authenticated;

create or replace function on_carpool_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform emit_society_activity(
    new.society_id, 'carpool',
    new.origin || ' → ' || new.destination,
    to_char(new.depart_at at time zone 'UTC', 'DD Mon, HH24:MI') || ' UTC · '
      || new.seats_total || ' seats',
    new.id, '/(resident)/community?tab=rides', new.created_by
  );
  return new;
end $$;
drop trigger if exists trg_carpool_activity on carpool_rides;
create trigger trg_carpool_activity after insert on carpool_rides
  for each row execute function on_carpool_activity();

-- ─────────────────────────────────────────────────────────────────────────
-- #59 Events calendar + RSVP
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists society_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int check (capacity is null or capacity > 0),
  cover_photo text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists society_events_society_starts_idx
  on society_events (society_id, starts_at);
alter table society_events enable row level security;
create policy society_events_read on society_events for select
  using (society_id = my_society());
create policy society_events_admin_write on society_events for all
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');

create table if not exists event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references society_events(id) on delete cascade,
  society_id uuid not null references societies(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  flat_id uuid references flats(id) on delete set null,
  response text not null check (response in ('going', 'maybe', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);
create index if not exists event_rsvps_event_idx on event_rsvps (event_id);
alter table event_rsvps enable row level security;
create policy event_rsvps_read on event_rsvps for select
  using (society_id = my_society());
create policy event_rsvps_upsert on event_rsvps for insert
  with check (
    society_id = my_society()
    and profile_id = clerk_uid()
    and my_role() in ('resident', 'admin')
  );
create policy event_rsvps_update on event_rsvps for update
  using (society_id = my_society() and profile_id = clerk_uid())
  with check (society_id = my_society() and profile_id = clerk_uid());

create or replace function upsert_event_rsvp(p_event_id uuid, p_response text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  ev society_events;
  going_count int;
  rsvp_id uuid;
begin
  if p_response not in ('going', 'maybe', 'declined') then
    raise exception 'invalid RSVP' using errcode = '22023';
  end if;
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('resident', 'admin') then
    raise exception 'members only' using errcode = '42501';
  end if;
  select * into ev from society_events
   where id = p_event_id and society_id = caller.society_id for update;
  if not found then raise exception 'event not found' using errcode = '42501'; end if;
  if ev.status <> 'scheduled' then raise exception 'event is not open for RSVP' using errcode = '23514'; end if;

  if p_response = 'going' and ev.capacity is not null then
    select count(*) into going_count
    from event_rsvps
    where event_id = p_event_id and response = 'going' and profile_id <> caller.id;
    if going_count >= ev.capacity then
      raise exception 'event is at capacity' using errcode = '23514';
    end if;
  end if;

  insert into event_rsvps (event_id, society_id, profile_id, flat_id, response)
  values (p_event_id, caller.society_id, caller.id, caller.flat_id, p_response)
  on conflict (event_id, profile_id) do update
    set response = excluded.response,
        updated_at = now()
  returning id into rsvp_id;
  return rsvp_id;
end;
$$;
revoke all on function upsert_event_rsvp(uuid, text) from public;
grant execute on function upsert_event_rsvp(uuid, text) to authenticated;

create or replace function on_event_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform emit_society_activity(
    new.society_id, 'event', new.title,
    coalesce(new.location, 'Society event'),
    new.id, '/(resident)/community?tab=events', new.created_by
  );
  perform notify_society_role(
    new.society_id, 'resident', 'event',
    jsonb_build_object(
      'title', 'New society event',
      'body', new.title,
      'url', '/(resident)/community?tab=events'
    )
  );
  return new;
end $$;
drop trigger if exists trg_event_activity on society_events;
create trigger trg_event_activity after insert on society_events
  for each row execute function on_event_activity();

-- Also emit when notices are posted (feed coverage for notices board).
create or replace function on_notice_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform emit_society_activity(
    new.society_id, 'notice', new.title,
    left(coalesce(new.body, ''), 160),
    new.id, '/(resident)/community?tab=notices', new.created_by
  );
  return new;
end $$;
drop trigger if exists trg_notice_activity on notices;
create trigger trg_notice_activity after insert on notices
  for each row execute function on_notice_activity();
