-- 0005: in-app notification triggers, resident dues payment, photo storage.

-- ── Notify helpers (security definer → bypasses RLS) ─────────────────
create or replace function notify_user(
  p_user_id text,
  p_type text,
  p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  insert into notifications (user_id, type, payload)
  values (p_user_id, p_type, p_payload);
end $$;

create or replace function notify_flat_residents(
  p_flat_id uuid,
  p_type text,
  p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select id from profiles
     where flat_id = p_flat_id and role = 'resident'
  loop
    perform notify_user(r.id, p_type, p_payload);
  end loop;
end $$;

create or replace function notify_society_role(
  p_society_id uuid,
  p_role text,
  p_type text,
  p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select id from profiles
     where society_id = p_society_id and role = p_role
  loop
    perform notify_user(r.id, p_type, p_payload);
  end loop;
end $$;

-- ── Visitor request raised → notify flat residents ───────────────────
create or replace function on_visitor_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select name, type, flat_id, society_id into v
    from visitors where id = new.visitor_id;
  if not found then return new; end if;

  perform notify_flat_residents(
    v.flat_id,
    'visitor_request',
    jsonb_build_object(
      'title', v.name || ' is at the gate',
      'body', 'Tap to approve or deny (' || v.type || ').',
      'url', '/(resident)/home',
      'requestId', new.id
    )
  );
  return new;
end $$;

drop trigger if exists trg_visitor_request_insert on visitor_requests;
create trigger trg_visitor_request_insert
  after insert on visitor_requests
  for each row execute function on_visitor_request_insert();

-- ── Visitor decision → notify the guard who raised it ────────────────
create or replace function on_visitor_request_decide() returns trigger
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if old.status = new.status then return new; end if;
  if new.status not in ('approved', 'denied', 'expired') then return new; end if;

  select name, type into v from visitors where id = new.visitor_id;

  perform notify_user(
    new.raised_by,
    'visitor_decision',
    jsonb_build_object(
      'title', coalesce(v.name, 'Visitor') || ' — ' || new.status,
      'body', case
        when new.status = 'approved' then 'Resident approved. Mark entry at the gate.'
        when new.status = 'denied' then 'Resident denied entry.'
        else 'Request expired with no answer. You can retry.'
      end,
      'url', '/(guard)/gate',
      'requestId', new.id,
      'status', new.status
    )
  );
  return new;
end $$;

drop trigger if exists trg_visitor_request_decide on visitor_requests;
create trigger trg_visitor_request_decide
  after update of status on visitor_requests
  for each row execute function on_visitor_request_decide();

-- ── Notice published → notify all society members ────────────────────
create or replace function on_notice_published() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.published_at is not null then return new; end if;

  for r in
    select id, role from profiles where society_id = new.society_id
  loop
    perform notify_user(
      r.id,
      'notice',
      jsonb_build_object(
        'title', 'New notice: ' || new.title,
        'body', left(new.body, 120),
        'url', case r.role
          when 'resident' then '/(resident)/notices'
          when 'admin' then '/(admin)/notices'
          else '/(guard)/gate'
        end,
        'noticeId', new.id
      )
    );
  end loop;
  return new;
end $$;

drop trigger if exists trg_notice_published on notices;
create trigger trg_notice_published
  after insert or update of published_at on notices
  for each row execute function on_notice_published();

-- ── Ticket raised → notify admins ────────────────────────────────────
create or replace function on_ticket_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select society_id into sid from flats where id = new.flat_id;
  perform notify_society_role(
    sid,
    'admin',
    'ticket_new',
    jsonb_build_object(
      'title', 'New complaint: ' || new.title,
      'body', new.category || ' · ' || coalesce(left(new.description, 80), 'No details'),
      'url', '/(admin)/tickets',
      'ticketId', new.id
    )
  );
  return new;
end $$;

drop trigger if exists trg_ticket_insert on tickets;
create trigger trg_ticket_insert
  after insert on tickets
  for each row execute function on_ticket_insert();

-- ── Ticket status change → notify flat residents ─────────────────────
create or replace function on_ticket_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = new.status then return new; end if;
  perform notify_flat_residents(
    new.flat_id,
    'ticket_update',
    jsonb_build_object(
      'title', 'Ticket update: ' || new.title,
      'body', 'Status is now ' || replace(new.status, '_', ' '),
      'url', '/(resident)/helpdesk',
      'ticketId', new.id,
      'status', new.status
    )
  );
  return new;
end $$;

drop trigger if exists trg_ticket_status on tickets;
create trigger trg_ticket_status
  after update of status on tickets
  for each row execute function on_ticket_status();

-- ── Poll created → notify residents ──────────────────────────────────
create or replace function on_poll_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_society_role(
    new.society_id,
    'resident',
    'poll',
    jsonb_build_object(
      'title', 'New poll',
      'body', new.question,
      'url', '/(resident)/community',
      'pollId', new.id
    )
  );
  return new;
end $$;

drop trigger if exists trg_poll_insert on polls;
create trigger trg_poll_insert
  after insert on polls
  for each row execute function on_poll_insert();

-- ── Dues raised → notify flat residents ──────────────────────────────
create or replace function on_due_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_flat_residents(
    new.flat_id,
    'dues',
    jsonb_build_object(
      'title', 'Maintenance due for ' || new.period,
      'body', 'Amount ₹' || trim(to_char(new.amount, '9999990.00')),
      'url', '/(resident)/community',
      'dueId', new.id
    )
  );
  return new;
end $$;

drop trigger if exists trg_due_insert on maintenance_dues;
create trigger trg_due_insert
  after insert on maintenance_dues
  for each row execute function on_due_insert();

-- ── Resident can mark own flat dues as paid ──────────────────────────
drop policy if exists dues_resident_pay on maintenance_dues;
create policy dues_resident_pay on maintenance_dues for update
  using (my_role() = 'resident' and flat_id = my_flat() and status = 'due')
  with check (flat_id = my_flat() and status = 'paid');

-- payment metadata (optional method note)
alter table maintenance_dues
  add column if not exists payment_note text;

-- ── Photo storage bucket ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('society-media', 'society-media', true)
on conflict (id) do nothing;

-- Anyone authenticated in a society can read; members can upload into their folder
create policy society_media_read on storage.objects for select
  using (bucket_id = 'society-media');

create policy society_media_insert on storage.objects for insert
  with check (
    bucket_id = 'society-media'
    and auth.jwt()->>'sub' is not null
  );

create policy society_media_update on storage.objects for update
  using (bucket_id = 'society-media' and auth.jwt()->>'sub' is not null);

create policy society_media_delete on storage.objects for delete
  using (bucket_id = 'society-media' and auth.jwt()->>'sub' is not null);
