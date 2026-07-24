-- 0007: Automatic Approval by guest type.
-- When a guard raises a visitor request, if the visitor's type is listed in
-- societies.settings.autoApproveTypes, approve instantly (security definer)
-- so the guard can mark entry without waiting for a resident.

-- Example settings shape:
--   { "autoApproveTypes": ["delivery", "cab"] }

-- Admins can update society settings (settings column only via app).
create policy societies_admin_update on societies for update
  using (my_role() = 'admin' and id = my_society())
  with check (id = my_society());

-- Auto-approve on insert when the visitor type is configured.
create or replace function auto_approve_visitor_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_society uuid;
  auto_types jsonb;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select v.type, v.society_id into v_type, v_society
    from visitors v where v.id = new.visitor_id;
  if not found then
    return new;
  end if;

  select coalesce(s.settings->'autoApproveTypes', '[]'::jsonb)
    into auto_types
    from societies s where s.id = v_society;

  if auto_types ? v_type then
    update visitor_requests
       set status = 'approved',
           decided_at = now(),
           decided_by = null
     where id = new.id
       and status = 'pending';
  end if;

  return new;
end $$;

drop trigger if exists trg_visitor_request_auto_approve on visitor_requests;
create trigger trg_visitor_request_auto_approve
  after insert on visitor_requests
  for each row execute function auto_approve_visitor_request();

-- Resident notify: informational when auto-approved, approve/deny otherwise.
create or replace function on_visitor_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v record;
  auto_types jsonb;
  is_auto boolean;
begin
  select name, type, flat_id, society_id into v
    from visitors where id = new.visitor_id;
  if not found then return new; end if;

  select coalesce(s.settings->'autoApproveTypes', '[]'::jsonb)
    into auto_types
    from societies s where s.id = v.society_id;

  is_auto := auto_types ? v.type;

  perform notify_flat_residents(
    v.flat_id,
    'visitor_request',
    jsonb_build_object(
      'title', v.name || ' is at the gate',
      'body', case
        when is_auto then
          'Auto-approved (' || v.type || '). No action needed.'
        else
          'Tap to approve or deny (' || v.type || ').'
      end,
      'url', '/(resident)/home',
      'requestId', new.id,
      'autoApproved', is_auto
    )
  );
  return new;
end $$;

-- Guard notify: distinguish auto-approve from resident approve.
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
        when new.status = 'approved' and new.decided_by is null then
          'Auto-approved. Mark entry at the gate.'
        when new.status = 'approved' then
          'Resident approved. Mark entry at the gate.'
        when new.status = 'denied' then
          'Resident denied entry.'
        else
          'Request expired with no answer. You can retry.'
      end,
      'url', '/(guard)/gate',
      'requestId', new.id,
      'status', new.status,
      'autoApproved', new.status = 'approved' and new.decided_by is null
    )
  );
  return new;
end $$;
