-- 0036_gamification_integrations_batch.sql
-- #94 Helpful badge, #100 ICS calendar, #101 partner delivery webhook,
-- #104 notice pin + readers, #107 shift handover, #108 defaulter flags,
-- #109 provider ratings. (#103 group passes already shipped in 0028.)

-- ═══════════════════════════════════════════════════════════════════════════
-- #104 Notice pin + reader roster
-- ═══════════════════════════════════════════════════════════════════════════

alter table notices
  add column if not exists pinned_at timestamptz;

create index if not exists notices_pinned_idx
  on notices (society_id, pinned_at desc nulls last, published_at desc);

create or replace function notice_readers(p_notice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if my_role() <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from notices n
    where n.id = p_notice_id and n.society_id = my_society()
  ) then
    raise exception 'notice not found' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'profile_id', p.id,
      'name', p.name,
      'flat_number', f.number,
      'read_at', r.read_at
    ) order by r.read_at desc)
    from notice_reads r
    join profiles p on p.id = r.profile_id
    left join flats f on f.id = p.flat_id
    where r.notice_id = p_notice_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function notice_readers(uuid) from public;
grant execute on function notice_readers(uuid) to authenticated;

create or replace function set_notice_pinned(p_notice_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_role() <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update notices
     set pinned_at = case when p_pinned then coalesce(pinned_at, now()) else null end
   where id = p_notice_id and society_id = my_society();
  if not found then
    raise exception 'notice not found' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function set_notice_pinned(uuid, boolean) from public;
grant execute on function set_notice_pinned(uuid, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- #100 Society calendar ICS feed token
-- ═══════════════════════════════════════════════════════════════════════════

alter table societies
  add column if not exists calendar_feed_token text;

update societies
   set calendar_feed_token = encode(gen_random_bytes(24), 'hex')
 where calendar_feed_token is null;

alter table societies
  alter column calendar_feed_token set default encode(gen_random_bytes(24), 'hex');

alter table societies
  alter column calendar_feed_token set not null;

create unique index if not exists societies_calendar_feed_token_uidx
  on societies (calendar_feed_token);

create or replace function my_society_calendar_token()
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if my_role() not in ('admin', 'resident', 'guard') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select calendar_feed_token from societies where id = my_society());
end;
$$;
revoke all on function my_society_calendar_token() from public;
grant execute on function my_society_calendar_token() to authenticated;

create or replace function rotate_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
begin
  if my_role() <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  token := encode(gen_random_bytes(24), 'hex');
  update societies set calendar_feed_token = token where id = my_society();
  return token;
end;
$$;
revoke all on function rotate_calendar_feed_token() from public;
grant execute on function rotate_calendar_feed_token() to authenticated;

-- Public feed lookup for edge function (service role / anon with token).
create or replace function society_events_for_calendar_token(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'description', e.description,
    'location', e.location,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'society_name', s.name
  ) order by e.starts_at), '[]'::jsonb)
  from societies s
  join society_events e on e.society_id = s.id
  where s.calendar_feed_token = p_token
    and e.status = 'scheduled'
    and e.ends_at >= now() - interval '1 day';
$$;
revoke all on function society_events_for_calendar_token(text) from public;
grant execute on function society_events_for_calendar_token(text) to service_role;
grant execute on function society_events_for_calendar_token(text) to anon;
grant execute on function society_events_for_calendar_token(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- #101 Partner delivery webhook keys + pre-approval insert
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists delivery_partner_keys (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  partner_slug text not null,
  hmac_secret text not null,
  label text,
  is_active boolean not null default true,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (society_id, partner_slug)
);
alter table delivery_partner_keys enable row level security;
create policy delivery_partner_keys_admin on delivery_partner_keys for all
  using (society_id = my_society() and my_role() = 'admin')
  with check (society_id = my_society() and my_role() = 'admin');

create table if not exists partner_delivery_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  partner_slug text not null,
  external_id text not null,
  pre_approval_id uuid references pre_approvals(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (society_id, partner_slug, external_id)
);
alter table partner_delivery_events enable row level security;
create policy partner_delivery_events_admin_read on partner_delivery_events for select
  using (society_id = my_society() and my_role() = 'admin');

create or replace function insert_partner_delivery_preapproval(
  p_society_id uuid,
  p_partner_slug text,
  p_external_id text,
  p_tower text,
  p_flat_number text,
  p_visitor_name text,
  p_valid_minutes integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flat flats;
  v_code text;
  v_id uuid;
  existing partner_delivery_events;
  mins int := least(greatest(coalesce(p_valid_minutes, 120), 15), 24 * 60);
begin
  if coalesce(nullif(btrim(p_partner_slug), ''), '') = ''
     or coalesce(nullif(btrim(p_external_id), ''), '') = '' then
    raise exception 'partner and external id required' using errcode = '22023';
  end if;

  select * into existing
  from partner_delivery_events
  where society_id = p_society_id
    and partner_slug = lower(btrim(p_partner_slug))
    and external_id = btrim(p_external_id);
  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'preApprovalId', existing.pre_approval_id
    );
  end if;

  select f.* into v_flat
  from flats f
  join towers t on t.id = f.tower_id
  where f.society_id = p_society_id
    and lower(t.name) = lower(btrim(p_tower))
    and lower(f.number) = lower(btrim(p_flat_number))
  limit 1;
  if not found then
    raise exception 'flat not found' using errcode = 'P0001';
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into pre_approvals (
    flat_id, created_by, visitor_name, type, code, valid_from, valid_to
  )
  select
    v_flat.id,
    (
      select p.id from profiles p
      where p.society_id = p_society_id and p.role = 'admin'
      order by p.created_at
      limit 1
    ),
    left(coalesce(nullif(btrim(p_visitor_name), ''), p_partner_slug || ' delivery'), 80),
    'delivery',
    v_code,
    now(),
    now() + make_interval(mins => mins)
  returning id into v_id;

  if v_id is null then
    raise exception 'could not create pre-approval (no admin profile?)' using errcode = 'P0001';
  end if;

  insert into partner_delivery_events (
    society_id, partner_slug, external_id, pre_approval_id, payload
  ) values (
    p_society_id,
    lower(btrim(p_partner_slug)),
    btrim(p_external_id),
    v_id,
    jsonb_build_object(
      'tower', p_tower,
      'flat', p_flat_number,
      'visitor_name', p_visitor_name,
      'code', v_code
    )
  );

  perform notify_flat_residents(
    v_flat.id,
    'pre_approval',
    jsonb_build_object(
      'title', 'Delivery arriving',
      'body', coalesce(nullif(btrim(p_visitor_name), ''), 'A courier')
              || ' has a gate pass for your flat.',
      'url', '/(resident)/pre-approvals?tab=preapproved',
      'code', v_code
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'preApprovalId', v_id,
    'code', v_code,
    'validMinutes', mins
  );
end;
$$;
revoke all on function insert_partner_delivery_preapproval(uuid,text,text,text,text,text,integer) from public;
grant execute on function insert_partner_delivery_preapproval(uuid,text,text,text,text,text,integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- #107 Guard shift handover notes
-- ═══════════════════════════════════════════════════════════════════════════

alter table guard_shifts
  add column if not exists handover_note text,
  add column if not exists handover_at timestamptz;

create or replace function set_guard_shift_handover(
  p_shift_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  shift guard_shifts;
  cleaned text := left(btrim(coalesce(p_note, '')), 1000);
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role not in ('guard', 'admin') then
    raise exception 'guards or admins only' using errcode = '42501';
  end if;
  if cleaned = '' then
    raise exception 'handover note required' using errcode = '22023';
  end if;

  select * into shift from guard_shifts where id = p_shift_id for update;
  if not found or shift.society_id <> caller.society_id then
    raise exception 'shift not found' using errcode = 'P0001';
  end if;
  if caller.role = 'guard' and shift.guard_id is distinct from caller.id then
    raise exception 'not your shift' using errcode = '42501';
  end if;
  if shift.status not in ('checked_in', 'completed') then
    raise exception 'check in before leaving a handover' using errcode = '23514';
  end if;

  update guard_shifts
     set handover_note = cleaned,
         handover_at = now()
   where id = p_shift_id;
end;
$$;
revoke all on function set_guard_shift_handover(uuid, text) from public;
grant execute on function set_guard_shift_handover(uuid, text) to authenticated;

-- Include handover in on-duty board.
create or replace function society_guards_on_duty()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(row order by row->>'sort_key'),
    '[]'::jsonb
  )
  from (
    select jsonb_build_object(
      'shift_id',       s.id,
      'guard_name',     coalesce(p.name, 'Guard'),
      'gate_id',        s.gate_id,
      'gate_name',      g.name,
      'starts_at',      s.starts_at,
      'ends_at',        s.ends_at,
      'status',         s.status,
      'checked_in_at',  s.checked_in_at,
      'checked_out_at', s.checked_out_at,
      'handover_note',  s.handover_note,
      'handover_at',    s.handover_at,
      'is_on_duty',     (
        s.status = 'checked_in'
        and s.checked_out_at is null
        and now() between s.starts_at and s.ends_at
      ),
      'sort_key', (
        case when s.status = 'checked_in' and s.checked_out_at is null
             then '0' else '1' end
      ) || to_char(s.starts_at, 'YYYYMMDDHH24MISS')
    ) as row
    from guard_shifts s
    left join profiles p on p.id = s.guard_id
    left join gates g    on g.id = s.gate_id
    where s.society_id = my_society()
      and s.status in ('scheduled', 'checked_in', 'completed')
      and s.ends_at   >= now() - interval '3 hours'
      and s.starts_at <= now() + interval '16 hours'
    limit 200
  ) rows;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- #108 Defaulter auto-flagging
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists flat_defaulter_flags (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  flat_id uuid not null references flats(id) on delete cascade,
  due_id uuid references maintenance_dues(id) on delete set null,
  period text not null,
  reason text not null default 'overdue',
  flagged_at timestamptz not null default now(),
  cleared_at timestamptz,
  unique (flat_id, period)
);
create index if not exists flat_defaulter_flags_open_idx
  on flat_defaulter_flags (society_id, flagged_at desc)
  where cleared_at is null;
alter table flat_defaulter_flags enable row level security;
create policy flat_defaulter_flags_read on flat_defaulter_flags for select
  using (
    society_id = my_society()
    and (my_role() = 'admin' or flat_id = my_flat())
  );

create or replace function flag_maintenance_defaulters(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  due_row maintenance_dues;
  flagged int := 0;
  cleared int := 0;
  bounded int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  society_filter uuid := null;
begin
  if clerk_uid() is not null then
    if my_role() <> 'admin' then
      raise exception 'admins only' using errcode = '42501';
    end if;
    society_filter := my_society();
  end if;

  -- Clear flags when dues are settled.
  update flat_defaulter_flags f
     set cleared_at = now()
   from maintenance_dues d
  where f.due_id = d.id
    and f.cleared_at is null
    and d.status in ('paid', 'waived')
    and (society_filter is null or f.society_id = society_filter);
  get diagnostics cleared = row_count;

  for due_row in
    select d.*
    from maintenance_dues d
    where d.status in ('due', 'claimed')
      and (
        d.late_fee_applied_at is not null
        or (d.due_on is not null and d.due_on < current_date)
      )
      and (society_filter is null or d.society_id = society_filter)
      and not exists (
        select 1 from flat_defaulter_flags f
        where f.flat_id = d.flat_id
          and f.period = d.period
          and f.cleared_at is null
      )
    order by d.due_on nulls last, d.id
    limit bounded
  loop
    insert into flat_defaulter_flags (society_id, flat_id, due_id, period, reason)
    values (
      due_row.society_id,
      due_row.flat_id,
      due_row.id,
      due_row.period,
      case when due_row.late_fee_applied_at is not null
           then 'overdue_with_late_fee' else 'overdue' end
    )
    on conflict (flat_id, period) do update
      set cleared_at = null,
          flagged_at = now(),
          due_id = excluded.due_id,
          reason = excluded.reason
    where flat_defaulter_flags.cleared_at is not null;

    perform notify_flat_residents(
      due_row.flat_id,
      'dues',
      jsonb_build_object(
        'title', 'Payment overdue',
        'body', 'Your ' || due_row.period || ' maintenance due is flagged as overdue.',
        'url', '/(resident)/payments',
        'due_id', due_row.id
      )
    );
    flagged := flagged + 1;
  end loop;

  return jsonb_build_object('flagged', flagged, 'cleared', cleared);
end;
$$;
revoke all on function flag_maintenance_defaulters(integer) from public;
grant execute on function flag_maintenance_defaulters(integer) to service_role;
grant execute on function flag_maintenance_defaulters(integer) to authenticated;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule(
      'portl-defaulter-flags-v0036',
      '30 1 * * *',
      'select public.flag_maintenance_defaulters(500);'
    );
  end if;
exception when others then
  raise notice 'Defaulter cron not installed: %', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- #109 Service provider ratings
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists service_provider_ratings (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  provider_id uuid not null references service_providers(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (provider_id, profile_id)
);
create index if not exists service_provider_ratings_provider_idx
  on service_provider_ratings (provider_id);
alter table service_provider_ratings enable row level security;
create policy service_provider_ratings_read on service_provider_ratings for select
  using (society_id = my_society());
create policy service_provider_ratings_write on service_provider_ratings for all
  using (society_id = my_society() and profile_id = clerk_uid())
  with check (
    society_id = my_society()
    and profile_id = clerk_uid()
    and my_role() = 'resident'
  );

create or replace function provider_rating_summary(p_provider_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg', round(avg(rating)::numeric, 1),
    'count', count(*)::int
  )
  from service_provider_ratings
  where provider_id = p_provider_id
    and society_id = my_society();
$$;
revoke all on function provider_rating_summary(uuid) from public;
grant execute on function provider_rating_summary(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- #94 Helpful Resident badge (kudos)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists resident_kudos (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references societies(id) on delete cascade,
  from_profile_id text not null references profiles(id) on delete cascade,
  to_profile_id text not null references profiles(id) on delete cascade,
  reason text not null default 'other'
    check (reason in ('helpdesk', 'community', 'other')),
  ref_id uuid,
  created_at timestamptz not null default now(),
  check (from_profile_id <> to_profile_id)
);
create unique index if not exists resident_kudos_unique_with_ref
  on resident_kudos (from_profile_id, to_profile_id, reason, ref_id)
  where ref_id is not null;
create unique index if not exists resident_kudos_unique_no_ref
  on resident_kudos (from_profile_id, to_profile_id, reason)
  where ref_id is null;
create index if not exists resident_kudos_to_idx
  on resident_kudos (to_profile_id, created_at desc);
alter table resident_kudos enable row level security;
create policy resident_kudos_read on resident_kudos for select
  using (society_id = my_society());
create policy resident_kudos_insert on resident_kudos for insert
  with check (
    society_id = my_society()
    and from_profile_id = clerk_uid()
    and my_role() in ('resident', 'admin')
  );

create or replace function give_resident_kudos(
  p_to_profile_id text,
  p_reason text default 'other',
  p_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller profiles;
  target profiles;
  cnt int;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_reason not in ('helpdesk', 'community', 'other') then
    p_reason := 'other';
  end if;
  if p_to_profile_id = caller.id then
    raise exception 'cannot kudos yourself' using errcode = '22023';
  end if;

  select * into target
  from profiles
  where id = p_to_profile_id and society_id = caller.society_id;
  if not found then
    raise exception 'member not found' using errcode = 'P0001';
  end if;

  begin
    insert into resident_kudos (society_id, from_profile_id, to_profile_id, reason, ref_id)
    values (caller.society_id, caller.id, target.id, p_reason, p_ref_id);
  exception when unique_violation then
    null;
  end;

  select count(*)::int into cnt
  from resident_kudos
  where to_profile_id = target.id
    and created_at >= now() - interval '90 days';

  perform notify_user(
    target.id,
    'kudos',
    jsonb_build_object(
      'title', 'Someone appreciated you',
      'body', coalesce(caller.name, 'A neighbour') || ' marked you as helpful.',
      'url', '/(resident)/profile'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'kudos_90d', cnt,
    'helpful_badge', cnt >= 3
  );
end;
$$;
revoke all on function give_resident_kudos(text, text, uuid) from public;
grant execute on function give_resident_kudos(text, text, uuid) to authenticated;

create or replace function profile_badges(p_profile_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select coalesce(p_profile_id, clerk_uid()) as id
  ),
  k as (
    select count(*)::int as cnt
    from resident_kudos r, target t
    where r.to_profile_id = t.id
      and r.society_id = my_society()
      and r.created_at >= now() - interval '90 days'
  )
  select jsonb_build_object(
    'helpful_resident', (select cnt >= 3 from k),
    'kudos_90d', (select cnt from k)
  );
$$;
revoke all on function profile_badges(text) from public;
grant execute on function profile_badges(text) to authenticated;

-- Patch admin notices dataset to include pinned_at (lightweight: notices only via RPC already covered).
-- Also expose open defaulter flags in analytics dues via optional join later — UI queries table directly.
