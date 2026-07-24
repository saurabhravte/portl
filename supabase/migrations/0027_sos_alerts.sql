-- 0027_sos_alerts.sql
-- Emergency SOS (resident) + Panic (guard) alerts.
--
-- A member raises an alert; it fans out immediately to every guard and admin
-- in the society (and, for a resident, to their own flat's family members) via
-- the existing notify_society_role / notify_flat_residents helpers, which the
-- push trigger turns into push notifications. Guards/admins acknowledge by
-- resolving the alert.
--
-- No GPS dependency: location is an optional free-text note so the app stays
-- buildable without adding expo-location.

create table if not exists sos_alerts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  raised_by text not null references profiles(id) on delete cascade,
  flat_id uuid references flats(id) on delete set null,
  kind text not null check (kind in ('sos', 'panic')),
  note text,
  status text not null default 'active' check (status in ('active', 'resolved')),
  resolved_by text references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sos_alerts_society_active_idx
  on sos_alerts (society_id, status, created_at desc);

alter table sos_alerts enable row level security;

-- Anyone in the society can raise their own alert.
create policy sos_alerts_insert on sos_alerts for insert
  with check (society_id = my_society() and raised_by = clerk_uid());

-- Guards/admins see all society alerts; the raiser and their flatmates see
-- their own so a resident can confirm the alert went out.
create policy sos_alerts_read on sos_alerts for select using (
  society_id = my_society()
  and (
    my_role() in ('guard', 'admin')
    or raised_by = clerk_uid()
    or flat_id = my_flat()
  )
);

-- Only guards/admins resolve (acknowledge) alerts.
create policy sos_alerts_resolve on sos_alerts for update using (
  society_id = my_society() and my_role() in ('guard', 'admin')
) with check (
  society_id = my_society() and my_role() in ('guard', 'admin')
);

-- ── Raise an alert ──────────────────────────────────────────────────────────
create or replace function raise_sos_alert(p_kind text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_society uuid := my_society();
  v_flat    uuid := my_flat();
  v_uid     text := clerk_uid();
  v_name    text;
  v_id      uuid;
  v_payload jsonb;
  v_title   text;
begin
  if v_society is null or v_uid is null then
    raise exception 'not a society member';
  end if;
  if p_kind not in ('sos', 'panic') then
    raise exception 'invalid alert kind';
  end if;

  select name into v_name from profiles where id = v_uid;

  insert into sos_alerts (society_id, raised_by, flat_id, kind, note)
  values (v_society, v_uid, v_flat, p_kind, nullif(btrim(p_note), ''))
  returning id into v_id;

  v_title := case when p_kind = 'panic' then 'PANIC: guard needs help'
                  else 'SOS: resident emergency' end;
  v_payload := jsonb_build_object(
    'title', v_title,
    'body', coalesce(v_name, 'A member') ||
            case when p_note is not null and btrim(p_note) <> ''
                 then ' — ' || btrim(p_note) else '' end,
    'url', '/(guard)/gate',
    'sos_id', v_id,
    'kind', p_kind
  );

  -- Fan out to on-site responders.
  perform notify_society_role(v_society, 'guard', 'sos', v_payload);
  perform notify_society_role(v_society, 'admin', 'sos', v_payload);
  -- And to the raiser's family so someone at home is aware.
  if v_flat is not null then
    perform notify_flat_residents(v_flat, 'sos', v_payload);
  end if;

  return v_id;
end;
$$;

-- ── Resolve (acknowledge) an alert ──────────────────────────────────────────
create or replace function resolve_sos_alert(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_role() not in ('guard', 'admin') then
    raise exception 'guard or admin role required';
  end if;
  update sos_alerts
     set status = 'resolved', resolved_by = clerk_uid(), resolved_at = now()
   where id = p_id and society_id = my_society() and status = 'active';
  if not found then
    raise exception 'alert not found or already resolved';
  end if;
end;
$$;

revoke all on function raise_sos_alert(text, text) from public;
revoke all on function resolve_sos_alert(uuid) from public;
grant execute on function raise_sos_alert(text, text) to authenticated;
grant execute on function resolve_sos_alert(uuid) to authenticated;
