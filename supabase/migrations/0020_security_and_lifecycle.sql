-- 0020: Release hardening for tenant RLS, lifecycle integrity, private media,
-- realtime delivery, and audited administrative overrides.

-- ── Tickets: operation-specific access and a role-aware state machine ───────
drop policy if exists tickets_resident on tickets;
drop policy if exists tickets_admin on tickets;
drop policy if exists tickets_resident_read on tickets;
drop policy if exists tickets_resident_insert on tickets;
drop policy if exists tickets_resident_update on tickets;
drop policy if exists tickets_admin_read on tickets;
drop policy if exists tickets_admin_insert on tickets;
drop policy if exists tickets_admin_update on tickets;
drop policy if exists tickets_admin_delete on tickets;

create policy tickets_resident_read on tickets for select using (
  my_role() = 'resident' and flat_id = my_flat()
);
create policy tickets_resident_insert on tickets for insert with check (
  my_role() = 'resident'
  and flat_id = my_flat()
  and status = 'open'
  and assigned_to is null
  and assigned_staff_id is null
  and first_response_at is null
  and resolved_at is null
  and closed_at is null
  and exists (
    select 1 from flats f
    where f.id = flat_id and f.society_id = my_society()
  )
);
create policy tickets_resident_update on tickets for update
  using (
    my_role() = 'resident'
    and flat_id = my_flat()
    and status = 'resolved'
  )
  with check (
    my_role() = 'resident'
    and flat_id = my_flat()
    and status in ('open', 'closed')
  );
create policy tickets_admin_read on tickets for select using (
  my_role() = 'admin'
  and exists (
    select 1 from flats f
    where f.id = flat_id and f.society_id = my_society()
  )
);
create policy tickets_admin_insert on tickets for insert with check (
  my_role() = 'admin'
  and status = 'open'
  and exists (
    select 1 from flats f
    where f.id = flat_id and f.society_id = my_society()
  )
);
create policy tickets_admin_update on tickets for update
  using (
    my_role() = 'admin'
    and exists (
      select 1 from flats f
      where f.id = flat_id and f.society_id = my_society()
    )
  )
  with check (
    my_role() = 'admin'
    and exists (
      select 1 from flats f
      where f.id = flat_id and f.society_id = my_society()
    )
  );
create policy tickets_admin_delete on tickets for delete using (
  my_role() = 'admin'
  and exists (
    select 1 from flats f
    where f.id = flat_id and f.society_id = my_society()
  )
);

create or replace function on_ticket_timestamps() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if tg_op = 'INSERT' then
    if current_user = 'authenticated'
       and caller_role not in ('resident', 'admin') then
      raise exception 'ticket creation requires a resident or administrator'
        using errcode = '42501';
    end if;
    new.status := 'open';
    new.assigned_to := null;
    new.assigned_staff_id := null;
    new.first_response_at := null;
    new.resolved_at := null;
    new.closed_at := null;
    new.response_due_at := new.created_at + interval '24 hours';
    return new;
  end if;
  if new.id is distinct from old.id
     or new.flat_id is distinct from old.flat_id
     or new.created_at is distinct from old.created_at
     or new.response_due_at is distinct from old.response_due_at then
    raise exception 'ticket identity and SLA deadline are immutable'
      using errcode = '42501';
  end if;

  if caller_role = 'resident' then
    if new.category is distinct from old.category
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.photos is distinct from old.photos
       or new.assigned_to is distinct from old.assigned_to
       or new.assigned_staff_id is distinct from old.assigned_staff_id
       or new.first_response_at is distinct from old.first_response_at
       or new.status = old.status
       or old.status <> 'resolved'
       or new.status not in ('open', 'closed') then
      raise exception 'residents may only confirm or reopen a resolved ticket'
        using errcode = '42501';
    end if;
  elsif caller_role = 'admin' then
    if new.category is distinct from old.category
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.photos is distinct from old.photos then
      raise exception 'ticket content is immutable after submission'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'open' and new.status = 'in_progress')
      or (old.status = 'in_progress' and new.status = 'resolved')
    ) then
      raise exception 'invalid administrative ticket transition'
        using errcode = '23514';
    end if;
    if old.status in ('resolved', 'closed')
       and (
         new.assigned_to is distinct from old.assigned_to
         or new.assigned_staff_id is distinct from old.assigned_staff_id
       ) then
      raise exception 'resolved tickets cannot be reassigned'
        using errcode = '23514';
    end if;
  else
    raise exception 'ticket updates require a resident or administrator'
      using errcode = '42501';
  end if;

  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
    new.closed_at := null;
  elsif new.status = 'closed' and old.status = 'resolved' then
    new.closed_at := now();
  elsif new.status = 'open' and old.status = 'resolved' then
    new.resolved_at := null;
    new.closed_at := null;
  else
    new.resolved_at := old.resolved_at;
    new.closed_at := old.closed_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_ticket_timestamps on tickets;
create trigger trg_ticket_timestamps
  before insert or update on tickets
  for each row execute function on_ticket_timestamps();

-- ── Pre-approvals: direct clients create/read; RPCs redeem/revoke ───────────
drop policy if exists pre_resident on pre_approvals;
drop policy if exists pre_resident_read on pre_approvals;
drop policy if exists pre_resident_insert on pre_approvals;
drop policy if exists pre_resident_delete on pre_approvals;
drop policy if exists pre_guard_read on pre_approvals;
drop policy if exists pre_guard_redeem on pre_approvals;
drop policy if exists pre_staff_read on pre_approvals;

create policy pre_resident_read on pre_approvals for select using (
  my_role() = 'resident' and flat_id = my_flat()
);
create policy pre_resident_insert on pre_approvals for insert with check (
  my_role() = 'resident'
  and flat_id = my_flat()
  and created_by = clerk_uid()
  and used_at is null
  and revoked_at is null
  and revoked_by is null
  and valid_from < valid_to
  and exists (
    select 1 from flats f
    where f.id = flat_id and f.society_id = my_society()
  )
);
create policy pre_staff_read on pre_approvals for select using (
  my_role() in ('guard', 'admin')
  and exists (
    select 1 from flats f
    where f.id = flat_id and f.society_id = my_society()
  )
);

create or replace function enforce_pre_approval_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if new.id is distinct from old.id
     or new.flat_id is distinct from old.flat_id
     or new.created_by is distinct from old.created_by
     or new.visitor_name is distinct from old.visitor_name
     or new.type is distinct from old.type
     or new.code is distinct from old.code
     or new.valid_from is distinct from old.valid_from
     or new.valid_to is distinct from old.valid_to
     or new.created_at is distinct from old.created_at then
    raise exception 'gate pass identity and validity are immutable'
      using errcode = '42501';
  end if;
  if old.used_at is not null or old.revoked_at is not null then
    raise exception 'used or revoked passes cannot be changed'
      using errcode = '23514';
  end if;
  if new.used_at is distinct from old.used_at then
    if caller_role not in ('guard', 'admin')
       or new.used_at is null
       or new.revoked_at is not null
       or new.revoked_by is not null
       or new.revoke_reason is not null then
      raise exception 'only gate staff may redeem an active pass'
        using errcode = '42501';
    end if;
  elsif new.revoked_at is distinct from old.revoked_at
        or new.revoked_by is distinct from old.revoked_by
        or new.revoke_reason is distinct from old.revoke_reason then
    if caller_role <> 'resident'
       or new.revoked_at is null
       or new.revoked_by is distinct from clerk_uid()
       or new.used_at is not null then
      raise exception 'only the resident owner may revoke an active pass'
        using errcode = '42501';
    end if;
  else
    raise exception 'gate pass update has no valid lifecycle transition'
      using errcode = '23514';
  end if;
  return new;
end $$;

-- ── Dues: immutable ledger identity and explicit claim/settlement paths ─────
create or replace function enforce_due_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from flats f
      where f.id = new.flat_id and f.society_id = new.society_id
    ) then
      raise exception 'due flat must belong to its society'
        using errcode = '23514';
    end if;
    if current_user = 'authenticated'
       and (
         caller_role <> 'admin'
         or new.status <> 'due'
         or new.paid_at is not null
         or new.claimed_at is not null
         or new.claimed_by is not null
         or new.confirmed_by is not null
       ) then
      raise exception 'new dues must start outstanding without settlement metadata'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.society_id is distinct from old.society_id
     or new.flat_id is distinct from old.flat_id
     or new.period is distinct from old.period
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at then
    raise exception 'due ledger identity is immutable' using errcode = '42501';
  end if;

  if caller_role = 'resident' then
    if old.status <> 'due'
       or new.status <> 'claimed'
       or new.claimed_by is distinct from clerk_uid()
       or new.claimed_at is null
       or new.paid_at is not null
       or new.confirmed_by is not null then
      raise exception 'residents may only claim an outstanding due'
        using errcode = '42501';
    end if;
  elsif caller_role = 'admin' then
    if not (
      (old.status = 'due' and new.status in ('paid', 'waived'))
      or (old.status = 'claimed' and new.status in ('due', 'paid', 'waived'))
    ) then
      raise exception 'invalid administrative due transition'
        using errcode = '23514';
    end if;
    if new.status = 'paid' and new.paid_at is null then
      raise exception 'paid dues require a payment timestamp'
        using errcode = '23514';
    end if;
    if old.status = 'claimed' and new.status = 'paid'
       and new.confirmed_by is distinct from clerk_uid() then
      raise exception 'claim confirmation must identify the administrator'
        using errcode = '23514';
    end if;
    if new.status = 'due'
       and (
         new.claimed_at is not null
         or new.claimed_by is not null
         or new.confirmed_by is not null
         or new.paid_at is not null
       ) then
      raise exception 'rejected claims must clear settlement metadata'
        using errcode = '23514';
    end if;
  else
    raise exception 'due updates require a resident or administrator'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_due_lifecycle on maintenance_dues;
create trigger trg_due_lifecycle before insert or update on maintenance_dues
  for each row execute function enforce_due_lifecycle();

-- ── Amenity bookings: tenant consistency and forward-only status changes ───
create or replace function enforce_amenity_booking_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
  amenity_society uuid;
  booking_society uuid;
begin
  select role into caller_role from profiles where id = clerk_uid();
  select society_id into amenity_society from amenities where id = new.amenity_id;
  select society_id into booking_society from flats where id = new.flat_id;
  if amenity_society is null
     or booking_society is distinct from amenity_society
     or not exists (
       select 1 from profiles p
       where p.id = new.booked_by
         and p.role = 'resident'
         and p.flat_id = new.flat_id
         and p.society_id = amenity_society
     ) then
    raise exception 'booking participants must belong to the amenity society'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.amenity_id is distinct from old.amenity_id
     or new.flat_id is distinct from old.flat_id
     or new.booked_by is distinct from old.booked_by
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.created_at is distinct from old.created_at then
    raise exception 'booking identity and slot are immutable'
      using errcode = '42501';
  end if;
  if caller_role = 'resident' then
    if new.booked_by is distinct from clerk_uid()
       or old.status not in ('pending', 'confirmed')
       or new.status <> 'cancelled' then
      raise exception 'residents may only cancel their active booking'
        using errcode = '42501';
    end if;
  elsif caller_role = 'admin' then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
      or (old.status = 'confirmed' and new.status = 'cancelled')
    ) then
      raise exception 'invalid administrative booking transition'
        using errcode = '23514';
    end if;
  else
    raise exception 'booking updates require a resident or administrator'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_amenity_booking_lifecycle on amenity_bookings;
create trigger trg_amenity_booking_lifecycle
  before insert or update on amenity_bookings
  for each row execute function enforce_amenity_booking_lifecycle();

-- ── Guard shifts: validate assignments and terminal states ─────────────────
create or replace function enforce_guard_shift_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if not exists (
    select 1 from profiles p
    where p.id = new.guard_id
      and p.role = 'guard'
      and p.society_id = new.society_id
  ) or (
    new.gate_id is not null
    and not exists (
      select 1 from gates g
      where g.id = new.gate_id and g.society_id = new.society_id
    )
  ) then
    raise exception 'shift guard and gate must belong to the same society'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'scheduled'
       or new.checked_in_at is not null
       or new.checked_out_at is not null then
      raise exception 'new shifts must begin scheduled'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.society_id is distinct from old.society_id
     or new.created_at is distinct from old.created_at then
    raise exception 'shift identity is immutable' using errcode = '42501';
  end if;
  if old.status in ('completed', 'missed', 'cancelled') then
    raise exception 'terminal shifts cannot be changed' using errcode = '23514';
  end if;
  if caller_role = 'guard' then
    if new.guard_id is distinct from old.guard_id
       or new.gate_id is distinct from old.gate_id
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or not (
         (old.status = 'scheduled' and new.status = 'checked_in')
         or (old.status = 'checked_in' and new.status = 'completed')
       ) then
      raise exception 'guards may only check in or complete their own shift'
        using errcode = '42501';
    end if;
  elsif caller_role = 'admin' then
    if new.status is distinct from old.status and not (
      (old.status = 'scheduled' and new.status in ('checked_in', 'missed', 'cancelled'))
      or (old.status = 'checked_in' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'invalid administrative shift transition'
        using errcode = '23514';
    end if;
    if old.status <> 'scheduled'
       and (
         new.guard_id is distinct from old.guard_id
         or new.gate_id is distinct from old.gate_id
         or new.starts_at is distinct from old.starts_at
         or new.ends_at is distinct from old.ends_at
       ) then
      raise exception 'active shifts cannot be rescheduled'
        using errcode = '23514';
    end if;
  else
    raise exception 'shift updates require its guard or an administrator'
      using errcode = '42501';
  end if;
  if new.status = 'scheduled'
     and (new.checked_in_at is not null or new.checked_out_at is not null) then
    raise exception 'scheduled shifts cannot have attendance timestamps'
      using errcode = '23514';
  elsif new.status = 'checked_in'
     and (new.checked_in_at is null or new.checked_out_at is not null) then
    raise exception 'checked-in shifts require only a check-in timestamp'
      using errcode = '23514';
  elsif new.status = 'completed'
     and (
       new.checked_in_at is null
       or new.checked_out_at is null
       or new.checked_out_at < new.checked_in_at
     ) then
    raise exception 'completed shifts require ordered attendance timestamps'
      using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_shift_lifecycle on guard_shifts;
create trigger trg_guard_shift_lifecycle
  before insert or update on guard_shifts
  for each row execute function enforce_guard_shift_lifecycle();

-- ── Polls and notices: immutable ownership and safe publication windows ─────
create or replace function enforce_poll_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if new.closes_at <= new.opens_at then
    raise exception 'poll close must follow poll open' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.target_flat_ids) target_id
    where not exists (
      select 1 from flats f
      where f.id = target_id and f.society_id = new.society_id
    )
  ) or exists (
    select 1 from unnest(new.target_tower_ids) target_id
    where not exists (
      select 1 from towers t
      where t.id = target_id and t.society_id = new.society_id
    )
  ) then
    raise exception 'poll targets must belong to its society'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if current_user = 'authenticated'
       and (
         new.created_by is distinct from clerk_uid()
         or caller_role <> 'admin'
       )
       or new.closed_at is not null
       or new.closed_by is not null then
      raise exception 'new polls require caller ownership and an open state'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.society_id is distinct from old.society_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'poll identity is immutable' using errcode = '42501';
  end if;
  if old.closed_at is not null then
    raise exception 'closed polls cannot be changed' using errcode = '23514';
  end if;
  if new.closed_at is not null then
    if new.closed_by is distinct from clerk_uid()
       or new.question is distinct from old.question
       or new.options is distinct from old.options
       or new.opens_at is distinct from old.opens_at
       or new.closes_at is distinct from old.closes_at
       or new.quorum_percent is distinct from old.quorum_percent
       or new.target_tower_ids is distinct from old.target_tower_ids
       or new.target_flat_ids is distinct from old.target_flat_ids
       or new.attachments is distinct from old.attachments then
      raise exception 'closing a poll cannot alter its ballot'
        using errcode = '23514';
    end if;
  elsif old.opens_at <= now()
        or exists (select 1 from poll_votes v where v.poll_id = old.id) then
    raise exception 'open or voted polls cannot be edited'
      using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_poll_lifecycle on polls;
create trigger trg_poll_lifecycle before insert or update on polls
  for each row execute function enforce_poll_lifecycle();

create or replace function enforce_notice_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = clerk_uid();
  if new.expires_at is not null
     and new.published_at is not null
     and new.expires_at <= new.published_at then
    raise exception 'notice expiry must follow publication'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.target_flat_ids) target_id
    where not exists (
      select 1 from flats f
      where f.id = target_id and f.society_id = new.society_id
    )
  ) or exists (
    select 1 from unnest(new.target_tower_ids) target_id
    where not exists (
      select 1 from towers t
      where t.id = target_id and t.society_id = new.society_id
    )
  ) then
    raise exception 'notice targets must belong to its society'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if current_user = 'authenticated'
       and (
         new.created_by is distinct from clerk_uid()
         or caller_role <> 'admin'
       ) then
      raise exception 'notice creator must be the caller' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.society_id is distinct from old.society_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'notice identity is immutable' using errcode = '42501';
  end if;
  if old.published_at is not null
     and new.published_at is distinct from old.published_at then
    raise exception 'published notices cannot be unpublished or rescheduled'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_notice_lifecycle on notices;
create trigger trg_notice_lifecycle before insert or update on notices
  for each row execute function enforce_notice_lifecycle();

-- ── Storage: exact app path, owner filename, roles, linked reads, images ────
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'society-media';

drop policy if exists society_media_read on storage.objects;
drop policy if exists society_media_insert on storage.objects;
drop policy if exists society_media_update on storage.objects;
drop policy if exists society_media_delete on storage.objects;

create policy society_media_read on storage.objects for select using (
  bucket_id = 'society-media'
  and array_length(string_to_array(name, '/'), 1) = 3
  and split_part(name, '/', 1) ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 1) = my_society()::text
  and split_part(name, '/', 2) in ('visitors', 'tickets')
  and (
    left(storage.filename(name), length(clerk_uid()) + 1) = clerk_uid() || '-'
    or (
      split_part(name, '/', 2) = 'visitors'
      and (
        my_role() in ('guard', 'admin')
        or exists (
          select 1 from visitors v
          where v.flat_id = my_flat()
            and v.society_id = my_society()
            and v.photo_url in (name, 'society-media:' || name)
        )
      )
    )
    or (
      split_part(name, '/', 2) = 'tickets'
      and (
        my_role() = 'admin'
        or exists (
          select 1 from tickets t
          join flats f on f.id = t.flat_id
          where t.flat_id = my_flat()
            and f.society_id = my_society()
            and (
              name = any(t.photos)
              or 'society-media:' || name = any(t.photos)
            )
        )
      )
    )
  )
);

create policy society_media_insert on storage.objects for insert with check (
  bucket_id = 'society-media'
  and array_length(string_to_array(name, '/'), 1) = 3
  and split_part(name, '/', 1) ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 1) = my_society()::text
  and split_part(name, '/', 2) in ('visitors', 'tickets')
  and left(storage.filename(name), length(clerk_uid()) + 1) = clerk_uid() || '-'
  and substring(
    storage.filename(name)
    from length(clerk_uid()) + 2
  ) ~ '^[0-9]+[.]jpg$'
  and (
    (split_part(name, '/', 2) = 'visitors' and my_role() in ('guard', 'admin'))
    or (split_part(name, '/', 2) = 'tickets' and my_role() in ('resident', 'admin'))
  )
  and lower(coalesce(metadata->>'mimetype', '')) in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  )
  and case
    when coalesce(metadata->>'size', metadata->>'contentLength', '')
         ~ '^[0-9]+$'
    then coalesce(metadata->>'size', metadata->>'contentLength')::bigint
         between 1 and 5242880
    else false
  end
);

create policy society_media_delete on storage.objects for delete using (
  bucket_id = 'society-media'
  and array_length(string_to_array(name, '/'), 1) = 3
  and split_part(name, '/', 1) ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 1) = my_society()::text
  and split_part(name, '/', 2) in ('visitors', 'tickets')
  and (
    my_role() = 'admin'
    or (
      left(storage.filename(name), length(clerk_uid()) + 1) = clerk_uid() || '-'
      and substring(
        storage.filename(name)
        from length(clerk_uid()) + 2
      ) ~ '^[0-9]+[.]jpg$'
    )
  )
);

-- ── Admin override: only unanswered or expired requests are eligible ───────
create or replace function admin_override_entry(
  p_idempotency_key uuid, p_request_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller profiles;
  claimed_id uuid;
  prior record;
  req record;
  log_id uuid;
  response jsonb;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'admin' then
    raise exception 'only society admins can override' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason (at least 5 characters) is required for an override.'
      using errcode = '22023';
  end if;

  select r.id, r.status, v.id visitor_id, v.name, v.flat_id
    into req
    from visitor_requests r
    join visitors v on v.id = r.visitor_id
   where r.id = p_request_id
     and v.society_id = caller.society_id
   for update of r;
  if not found then
    raise exception 'request not found in your society' using errcode = '42501';
  end if;
  insert into gate_operations(idempotency_key, actor_id, society_id, operation)
  values(p_idempotency_key, caller.id, caller.society_id, 'admin_override')
  on conflict(actor_id, idempotency_key) do nothing
  returning id into claimed_id;
  if claimed_id is null then
    select operation, result into prior
      from gate_operations
     where actor_id = caller.id and idempotency_key = p_idempotency_key;
    if prior.operation <> 'admin_override' then
      raise exception 'idempotency key reused for another operation'
        using errcode = '22023';
    end if;
    return prior.result;
  end if;

  if req.status not in ('pending', 'expired') then
    raise exception 'only pending or expired requests may be overridden'
      using errcode = '23514';
  end if;
  if exists (select 1 from gate_logs where visitor_id = req.visitor_id) then
    raise exception 'visitor already has a gate entry' using errcode = '23514';
  end if;

  if req.status = 'pending' then
    update visitor_requests
       set status = 'approved', decided_by = caller.id, decided_at = now()
     where id = req.id;
  end if;
  insert into gate_logs(
    visitor_id, entry_at, entry_guard_id, method, override_reason
  ) values (
    req.visitor_id, now(), caller.id, 'admin_override', trim(p_reason)
  ) returning id into log_id;
  perform notify_flat_residents(
    req.flat_id,
    'visitor_decision',
    jsonb_build_object(
      'title', req.name || ' let in by admin override',
      'body', 'Reason: ' || trim(p_reason),
      'url', '/(resident)/history',
      'gateLogId', log_id
    )
  );
  response := jsonb_build_object(
    'gate_log_id', log_id,
    'visitor_name', req.name
  );
  update gate_operations
     set result = response, completed_at = now()
   where id = claimed_id;
  return response;
end $$;
revoke all on function admin_override_entry(uuid, uuid, text) from public;
grant execute on function admin_override_entry(uuid, uuid, text) to authenticated;

-- ── Realtime: publication membership is safe to re-run ─────────────────────
do $$
declare
  relation_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;
  foreach relation_name in array array[
    'notifications',
    'visitor_requests',
    'gate_logs'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        relation_name
      );
    end if;
  end loop;
end $$;

revoke all on function enforce_due_lifecycle() from public;
revoke all on function enforce_amenity_booking_lifecycle() from public;
revoke all on function enforce_guard_shift_lifecycle() from public;
revoke all on function enforce_poll_lifecycle() from public;
revoke all on function enforce_notice_lifecycle() from public;
