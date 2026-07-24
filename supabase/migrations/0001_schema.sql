

create extension if not exists btree_gist;

create table societies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table towers (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  name text not null
);

create table flats (
  id uuid primary key default gen_random_uuid(),
  tower_id uuid not null references towers(id) on delete cascade,
  society_id uuid not null references societies(id) on delete cascade,
  number text not null,
  occupancy_status text not null default 'occupied',
  unique (tower_id, number)
);

create table profiles (
  id text primary key,                          -- Clerk user id
  society_id uuid not null references societies(id) on delete cascade,
  role text not null check (role in ('resident','guard','admin')),
  flat_id uuid references flats(id) on delete set null,
  name text not null,
  phone text,
  expo_push_token text,
  created_at timestamptz not null default now()
);

create table visitors (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  type text not null check (type in ('guest','delivery','cab','service')),
  name text not null,
  phone text,
  photo_url text,
  vehicle_no text,
  created_at timestamptz not null default now()
);

create table visitor_requests (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references visitors(id) on delete cascade,
  raised_by text not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','approved','denied','expired')),
  decided_by text references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table gate_logs (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references visitors(id) on delete cascade,
  entry_at timestamptz not null,
  exit_at timestamptz,
  entry_guard_id text references profiles(id),
  exit_guard_id text references profiles(id),
  method text not null default 'approved' check (method in ('approved','pre_approved','admin_override')),
  check (exit_at is null or exit_at > entry_at)
);

create table pre_approvals (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  created_by text not null references profiles(id),
  visitor_name text not null,
  type text not null check (type in ('guest','delivery','cab','service')),
  code text not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (valid_to > valid_from)
);
create unique index pre_approvals_code_active on pre_approvals (code) where used_at is null;

create table tickets (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  photos text[] not null default '{}',
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to text references profiles(id),
  created_at timestamptz not null default now()
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  title text not null,
  body text not null,
  attachment_url text,
  audience text not null default 'all',
  published_at timestamptz,
  expires_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- status machine: pending -> approved | denied | expired, nothing else
create or replace function enforce_request_transition() returns trigger as $$
begin
  if old.status <> 'pending' then
    raise exception 'request already %', old.status;
  end if;
  if new.status not in ('approved','denied','expired') then
    raise exception 'invalid transition';
  end if;
  return new;
end $$ language plpgsql;

create trigger visitor_request_transition
  before update of status on visitor_requests
  for each row execute function enforce_request_transition();
