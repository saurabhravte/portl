-- 0009: Helpdesk lifecycle — comment thread, staff assignment, resident
-- confirm/reopen, and first-response tracking for the <24h SLA metric
-- (review §4/§5.1, sprint ticket #9).

-- 1. Ticket columns
alter table tickets
  add column if not exists assigned_staff_id uuid references staff(id) on delete set null,
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz;

-- 2. Comment thread
create table if not exists ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id text not null references profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_idx on ticket_comments (ticket_id, created_at);

alter table ticket_comments enable row level security;

-- Residents read/write comments on their flat's tickets; admins on any
-- ticket in their society. Authors always write as themselves.
create policy ticket_comments_read on ticket_comments for select using (
  exists (
    select 1 from tickets t
    join flats f on f.id = t.flat_id
    where t.id = ticket_id
      and f.society_id = my_society()
      and (my_role() = 'admin' or t.flat_id = my_flat())
  )
);
create policy ticket_comments_insert on ticket_comments for insert with check (
  author_id = clerk_uid()
  and exists (
    select 1 from tickets t
    join flats f on f.id = t.flat_id
    where t.id = ticket_id
      and f.society_id = my_society()
      and (my_role() = 'admin' or t.flat_id = my_flat())
  )
);

-- 3. Status-machine timestamps (resolved_at / closed_at / reopen support).
-- Residents already have FOR ALL on their flat's tickets, so they can
-- confirm (resolved → closed) or reopen (resolved → open).
create or replace function on_ticket_timestamps() returns trigger
language plpgsql as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
  elsif new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := now();
  elsif new.status = 'open' and old.status = 'resolved' then
    -- reopened by the resident
    new.resolved_at := null;
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_ticket_timestamps on tickets;
create trigger trg_ticket_timestamps
  before update of status on tickets
  for each row execute function on_ticket_timestamps();

-- 4. Comment notifications + first-response stamping.
create or replace function on_ticket_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
  author record;
  sid uuid;
begin
  select tk.id, tk.title, tk.flat_id, tk.first_response_at into t
    from tickets tk where tk.id = new.ticket_id;
  if not found then return new; end if;

  select p.role, p.name, p.society_id into author
    from profiles p where p.id = new.author_id;
  sid := author.society_id;

  if author.role = 'admin' then
    -- First admin reply stamps first_response_at (SLA metric).
    if t.first_response_at is null then
      update tickets set first_response_at = now() where id = t.id;
    end if;
    perform notify_flat_residents(
      t.flat_id,
      'ticket_update',
      jsonb_build_object(
        'title', 'Reply on: ' || t.title,
        'body', left(new.body, 120),
        'url', '/(resident)/helpdesk',
        'ticketId', t.id
      )
    );
  else
    perform notify_society_role(
      sid,
      'admin',
      'ticket_update',
      jsonb_build_object(
        'title', author.name || ' commented on: ' || t.title,
        'body', left(new.body, 120),
        'url', '/(admin)/tickets',
        'ticketId', t.id
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_ticket_comment on ticket_comments;
create trigger trg_ticket_comment
  after insert on ticket_comments
  for each row execute function on_ticket_comment();

-- 5. Staff assignment notification.
create or replace function on_ticket_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if new.assigned_staff_id is null
     or new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;
  select name, category into s from staff where id = new.assigned_staff_id;
  perform notify_flat_residents(
    new.flat_id,
    'ticket_update',
    jsonb_build_object(
      'title', 'Ticket assigned: ' || new.title,
      'body', coalesce(s.name, 'Staff') || ' (' || coalesce(s.category, 'staff') || ') will handle this.',
      'url', '/(resident)/helpdesk',
      'ticketId', new.id
    )
  );
  return new;
end $$;

drop trigger if exists trg_ticket_assign on tickets;
create trigger trg_ticket_assign
  after update of assigned_staff_id on tickets
  for each row execute function on_ticket_assign();
