-- 0014: North-star metric instrumentation, per-flat auto-approval opt-out,
-- and the full-screen approval deep link
-- (review §5.2/§5.5/§5.6, sprint tickets #16 and #18).

-- ── 1. Approval-time metrics for admins (ticket #16) ─────────────────
-- Median approval time vs the plan's <15s target, plus digital-entry and
-- auto-approval shares. decided_by is null on auto-approvals.
create or replace function approval_time_stats(p_days int default 7)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller record;
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  result jsonb;
begin
  select role, society_id into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'admin' then
    raise exception 'admins only';
  end if;

  select jsonb_build_object(
    'days', p_days,
    'total_requests', count(*),
    'median_manual_seconds', round(coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (r.decided_at - r.created_at))
      ) filter (where r.status = 'approved' and r.decided_by is not null),
      0))::int,
    'approved', count(*) filter (where r.status = 'approved'),
    'auto_approved', count(*) filter (where r.status = 'approved' and r.decided_by is null),
    'denied', count(*) filter (where r.status = 'denied'),
    'expired', count(*) filter (where r.status = 'expired')
  ) into result
  from visitor_requests r
  join visitors v on v.id = r.visitor_id
  where v.society_id = caller.society_id
    and r.created_at >= since;

  return result;
end $$;

revoke all on function approval_time_stats(int) from public;
grant execute on function approval_time_stats(int) to authenticated;

-- ── 2. Per-flat auto-approval opt-out (ticket #18) ───────────────────
-- "Always ask me for deliveries": a flat can exclude visitor types from
-- society-wide auto-approval. Stored in flats.settings.noAutoApproveTypes.
alter table flats add column if not exists settings jsonb not null default '{}';

-- Residents change only this setting through a definer RPC (a broad flats
-- UPDATE policy would let them rename the flat).
create or replace function set_my_flat_auto_approve_optout(p_types text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller record;
  cleaned text[];
begin
  select role, flat_id into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'resident' or caller.flat_id is null then
    raise exception 'only residents with a linked flat can change this';
  end if;
  select coalesce(array_agg(t), '{}') into cleaned
    from unnest(p_types) t
   where t in ('guest','delivery','cab','service');

  update flats
     set settings = jsonb_set(settings, '{noAutoApproveTypes}', to_jsonb(cleaned))
   where id = caller.flat_id;

  return jsonb_build_object('noAutoApproveTypes', cleaned);
end $$;

revoke all on function set_my_flat_auto_approve_optout(text[]) from public;
grant execute on function set_my_flat_auto_approve_optout(text[]) to authenticated;

-- Auto-approve trigger now honours the flat's opt-out.
create or replace function auto_approve_visitor_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v record;
  auto_types jsonb;
  flat_optout jsonb;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select vv.type, vv.society_id, vv.flat_id into v
    from visitors vv where vv.id = new.visitor_id;
  if not found then
    return new;
  end if;

  select coalesce(s.settings->'autoApproveTypes', '[]'::jsonb)
    into auto_types
    from societies s where s.id = v.society_id;

  select coalesce(f.settings->'noAutoApproveTypes', '[]'::jsonb)
    into flat_optout
    from flats f where f.id = v.flat_id;

  if auto_types ? v.type and not (flat_optout ? v.type) then
    update visitor_requests
       set status = 'approved',
           decided_at = now(),
           decided_by = null
     where id = new.id
       and status = 'pending';
  end if;

  return new;
end $$;

-- ── 3. Full-screen approval deep link + flat opt-out aware copy ──────
-- Notification tap now lands on a dedicated approval screen instead of
-- Home (review §5.2). Also labels auto-approvals for transparency (§5.5).
create or replace function on_visitor_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v record;
  auto_types jsonb;
  flat_optout jsonb;
  is_auto boolean;
begin
  select name, type, flat_id, society_id into v
    from visitors where id = new.visitor_id;
  if not found then return new; end if;

  select coalesce(s.settings->'autoApproveTypes', '[]'::jsonb)
    into auto_types
    from societies s where s.id = v.society_id;
  select coalesce(f.settings->'noAutoApproveTypes', '[]'::jsonb)
    into flat_optout
    from flats f where f.id = v.flat_id;

  is_auto := (auto_types ? v.type) and not (flat_optout ? v.type);

  perform notify_flat_residents(
    v.flat_id,
    'visitor_request',
    jsonb_build_object(
      'title', v.name || ' is at the gate',
      'body', case
        when is_auto then
          'Auto-approved by society policy (' || v.type || '). No action needed.'
        else
          'Tap to approve or deny (' || v.type || ').'
      end,
      'url', case
        when is_auto then '/(resident)/home'
        else '/(resident)/approve?requestId=' || new.id
      end,
      'requestId', new.id,
      'autoApproved', is_auto
    )
  );
  return new;
end $$;
