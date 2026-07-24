-- 0026_guard_attendance.sql
-- Guard attendance / "who is on duty" visibility.
--
-- Problem: guard_shifts RLS (0017) only lets admins and the guard themselves
-- read the shift table. Residents therefore cannot see which guard is on duty
-- at which gate. We expose a *minimal, read-only* projection via two
-- SECURITY DEFINER functions instead of loosening the base-table RLS (which
-- would leak scheduling data and PII). Both functions are hard-scoped to the
-- caller's own society via my_society().
--
-- society_guards_on_duty()        -> any authenticated society member
-- society_guard_attendance_summary(from,to) -> admins only
--
-- Both return jsonb so no composite types leak into the generated TS types
-- (same pattern as admin_audit_page / admin_dataset_page).

-- ── Resident/guard/admin: live "on duty" board ──────────────────────────────
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
      -- on duty now = checked in, inside the shift window, not yet checked out
      'is_on_duty',     (
        s.status = 'checked_in'
        and s.checked_out_at is null
        and now() between s.starts_at and s.ends_at
      ),
      -- ordering: on-duty first, then soonest-starting
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
      -- a useful "today" window: currently relevant shifts only
      and s.ends_at   >= now() - interval '3 hours'
      and s.starts_at <= now() + interval '16 hours'
    limit 200
  ) rows;
$$;

revoke all on function society_guards_on_duty() from public;
grant execute on function society_guards_on_duty() to authenticated;

-- ── Admin: attendance roll-up over a window ─────────────────────────────────
create or replace function society_guard_attendance_summary(
  p_from timestamptz default (now() - interval '24 hours'),
  p_to   timestamptz default (now() + interval '24 hours')
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if my_role() <> 'admin' then
    raise exception 'admin role required';
  end if;

  select jsonb_build_object(
    'scheduled',   count(*) filter (where status = 'scheduled'),
    'checked_in',  count(*) filter (where status = 'checked_in'),
    'completed',   count(*) filter (where status = 'completed'),
    'missed',      count(*) filter (where status = 'missed'),
    'cancelled',   count(*) filter (where status = 'cancelled'),
    'on_duty_now', count(*) filter (
      where status = 'checked_in'
        and checked_out_at is null
        and now() between starts_at and ends_at
    ),
    'from', p_from,
    'to',   p_to
  )
  into result
  from guard_shifts
  where society_id = my_society()
    and starts_at < p_to
    and ends_at   > p_from;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function society_guard_attendance_summary(timestamptz, timestamptz) from public;
grant execute on function society_guard_attendance_summary(timestamptz, timestamptz) to authenticated;
