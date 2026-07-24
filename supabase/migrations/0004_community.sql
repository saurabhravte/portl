-- 0004: community features — polls, amenity booking, staff directory, dues.

-- ── Polls ────────────────────────────────────────────────────────────
create table polls (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  question text not null,
  options jsonb not null,               -- ["Yes","No",...] max 6
  created_by text not null references profiles(id),
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6)
);

create table poll_votes (
  poll_id uuid not null references polls(id) on delete cascade,
  voter_id text not null references profiles(id) on delete cascade,
  option_index int not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (poll_id, voter_id)       -- one vote per resident
);

-- ── Amenities ────────────────────────────────────────────────────────
create table amenities (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  name text not null,
  description text,
  open_time time not null default '06:00',
  close_time time not null default '22:00',
  slot_minutes int not null default 60 check (slot_minutes in (30, 60, 90, 120)),
  is_active boolean not null default true
);

create table amenity_bookings (
  id uuid primary key default gen_random_uuid(),
  amenity_id uuid not null references amenities(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  booked_by text not null references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- no double booking of the same amenity for overlapping confirmed slots
  exclude using gist (
    amenity_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'confirmed')
);

-- ── Staff / service providers ────────────────────────────────────────
create table staff (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  name text not null,
  category text not null,               -- plumber, electrician, maid, security...
  phone text,
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Maintenance dues ─────────────────────────────────────────────────
create table maintenance_dues (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  period text not null,                 -- e.g. '2026-07'
  amount numeric(10,2) not null check (amount >= 0),
  status text not null default 'due' check (status in ('due','paid','waived')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (flat_id, period)
);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table polls enable row level security;
alter table poll_votes enable row level security;
alter table amenities enable row level security;
alter table amenity_bookings enable row level security;
alter table staff enable row level security;
alter table maintenance_dues enable row level security;

-- polls: society members read; admin writes
create policy polls_read on polls for select using (society_id = my_society());
create policy polls_admin on polls for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (society_id = my_society());

-- votes: residents vote once on open polls in their society; everyone in
-- the society can read (for tallies)
create policy votes_read on poll_votes for select using (
  exists (select 1 from polls p where p.id = poll_id and p.society_id = my_society())
);
create policy votes_insert on poll_votes for insert with check (
  voter_id = clerk_uid()
  and my_role() = 'resident'
  and exists (select 1 from polls p
              where p.id = poll_id
                and p.society_id = my_society()
                and p.closes_at > now())
);

-- amenities: society reads; admin manages
create policy amenities_read on amenities for select using (society_id = my_society());
create policy amenities_admin on amenities for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (society_id = my_society());

-- bookings: resident books for own flat, cancels own; admin manages;
-- guards can read (to verify who's using the clubhouse)
create policy bookings_read on amenity_bookings for select using (
  exists (select 1 from amenities a where a.id = amenity_id and a.society_id = my_society())
);
create policy bookings_resident_insert on amenity_bookings for insert with check (
  my_role() = 'resident' and flat_id = my_flat() and booked_by = clerk_uid()
);
create policy bookings_resident_update on amenity_bookings for update using (
  (my_role() = 'resident' and booked_by = clerk_uid()) or my_role() = 'admin'
);

-- staff: society reads active; admin manages
create policy staff_read on staff for select using (society_id = my_society());
create policy staff_admin on staff for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (society_id = my_society());

-- dues: resident sees own flat; admin manages society
create policy dues_read on maintenance_dues for select using (
  society_id = my_society() and (my_role() = 'admin' or flat_id = my_flat())
);
create policy dues_admin on maintenance_dues for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (society_id = my_society());

-- ── Guard resident-search ────────────────────────────────────────────
-- Guards can look up residents in their society (name → flat) at the gate.
create policy profiles_guard_read on profiles for select using (
  my_role() = 'guard' and society_id = my_society() and role = 'resident'
);
