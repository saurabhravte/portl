-- 0035_society_analytics.sql
-- Features #80–#85: society analytics bundle for the admin Insights screen.

create or replace function society_analytics_bundle(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  caller profiles;
  days int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => days);
  sid uuid;
  traffic jsonb;
  approvals jsonb;
  complaints jsonb;
  amenities jsonb;
  dues jsonb;
  polls jsonb;
  guards jsonb;
  latest_period text;
  flat_count int;
begin
  select * into caller from profiles where id = clerk_uid();
  if not found or caller.role <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  sid := caller.society_id;

  select count(*)::int into flat_count from flats where society_id = sid;

  -- #80 Visitor traffic heatmap (hour × day-of-week) from gate entries.
  select jsonb_build_object(
    'days', days,
    'entries', count(*),
    'exits', count(*) filter (where gl.exit_at is not null),
    'inside_now', (
      select count(*) from gate_logs g2
      join visitors v2 on v2.id = g2.visitor_id
      where v2.society_id = sid and g2.exit_at is null
    ),
    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'count', c) order by h)
      from (
        select extract(hour from gl.entry_at at time zone 'Asia/Kolkata')::int as h,
               count(*)::int as c
        from gate_logs gl
        join visitors v on v.id = gl.visitor_id
        where v.society_id = sid and gl.entry_at >= since
        group by 1
      ) x
    ), '[]'::jsonb),
    'by_dow', coalesce((
      select jsonb_agg(jsonb_build_object('dow', d, 'count', c) order by d)
      from (
        select extract(dow from gl.entry_at at time zone 'Asia/Kolkata')::int as d,
               count(*)::int as c
        from gate_logs gl
        join visitors v on v.id = gl.visitor_id
        where v.society_id = sid and gl.entry_at >= since
        group by 1
      ) x
    ), '[]'::jsonb),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dow', dow, 'hour', hour, 'count', cnt
      ) order by dow, hour)
      from (
        select extract(dow from gl.entry_at at time zone 'Asia/Kolkata')::int as dow,
               extract(hour from gl.entry_at at time zone 'Asia/Kolkata')::int as hour,
               count(*)::int as cnt
        from gate_logs gl
        join visitors v on v.id = gl.visitor_id
        where v.society_id = sid and gl.entry_at >= since
        group by 1, 2
      ) cells
    ), '[]'::jsonb)
  )
  into traffic
  from gate_logs gl
  join visitors v on v.id = gl.visitor_id
  where v.society_id = sid and gl.entry_at >= since;

  approvals := approval_time_stats(days);

  -- #81 Complaint resolution metrics
  select jsonb_build_object(
    'days', days,
    'total', count(*),
    'open', count(*) filter (where t.status = 'open'),
    'in_progress', count(*) filter (where t.status = 'in_progress'),
    'resolved', count(*) filter (where t.status = 'resolved'),
    'closed', count(*) filter (where t.status = 'closed'),
    'median_first_response_hours', round(coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (t.first_response_at - t.created_at)) / 3600.0
      ) filter (where t.first_response_at is not null),
      0
    )::numeric, 1),
    'median_resolution_hours', round(coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (coalesce(t.resolved_at, t.closed_at) - t.created_at)) / 3600.0
      ) filter (where coalesce(t.resolved_at, t.closed_at) is not null),
      0
    )::numeric, 1),
    'sla_hit_pct', round(
      100.0 * count(*) filter (
        where t.first_response_at is not null
          and t.response_due_at is not null
          and t.first_response_at <= t.response_due_at
      ) / nullif(count(*) filter (where t.first_response_at is not null), 0),
      1
    )
  )
  into complaints
  from tickets t
  join flats f on f.id = t.flat_id
  where f.society_id = sid and t.created_at >= since;

  amenities := amenity_usage_stats(days);

  -- #83 Collection % + defaulters (latest period with dues, else current YYYY-MM)
  select max(period) into latest_period
  from maintenance_dues
  where society_id = sid;

  if latest_period is null then
    latest_period := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  end if;

  select jsonb_build_object(
    'period', latest_period,
    'flat_count', flat_count,
    'raised', count(*),
    'paid', count(*) filter (where d.status = 'paid'),
    'waived', count(*) filter (where d.status = 'waived'),
    'outstanding', count(*) filter (where d.status in ('due', 'claimed')),
    'amount_raised', coalesce(sum(d.amount), 0),
    'amount_collected', coalesce(sum(
      case when d.status = 'paid' then
        d.amount + case when d.late_fee_waived_at is null then coalesce(d.late_fee_amount, 0) else 0 end
      else 0 end
    ), 0),
    'amount_outstanding', coalesce(sum(
      case when d.status in ('due', 'claimed') then
        d.amount + case when d.late_fee_waived_at is null then coalesce(d.late_fee_amount, 0) else 0 end
      else 0 end
    ), 0),
    'collection_pct', round(
      100.0 * count(*) filter (where d.status in ('paid', 'waived'))
        / nullif(count(*), 0),
      1
    ),
    'defaulters', coalesce((
      select jsonb_agg(row order by row->>'tower_name', row->>'flat_number')
      from (
        select jsonb_build_object(
          'due_id', d2.id,
          'flat_id', f2.id,
          'flat_number', f2.number,
          'tower_name', tw.name,
          'period', d2.period,
          'status', d2.status,
          'amount', d2.amount,
          'late_fee_amount', case
            when d2.late_fee_waived_at is null then coalesce(d2.late_fee_amount, 0)
            else 0 end,
          'payable', d2.amount + case
            when d2.late_fee_waived_at is null then coalesce(d2.late_fee_amount, 0)
            else 0 end
        ) as row
        from maintenance_dues d2
        join flats f2 on f2.id = d2.flat_id
        join towers tw on tw.id = f2.tower_id
        where d2.society_id = sid
          and d2.period = latest_period
          and d2.status in ('due', 'claimed')
        order by tw.name, f2.number
        limit 100
      ) rows
    ), '[]'::jsonb)
  )
  into dues
  from maintenance_dues d
  where d.society_id = sid and d.period = latest_period;

  -- #84 Poll participation / engagement
  select jsonb_build_object(
    'days', days,
    'polls', coalesce((
      select jsonb_agg(row order by (row->>'opens_at') desc)
      from (
        select jsonb_build_object(
          'poll_id', p.id,
          'question', left(p.question, 120),
          'opens_at', p.opens_at,
          'closes_at', p.closes_at,
          'closed_at', p.closed_at,
          'vote_count', coalesce(vc.votes, 0),
          'eligible_flats', case
            when cardinality(p.target_flat_ids) > 0 then cardinality(p.target_flat_ids)
            when cardinality(p.target_tower_ids) > 0 then (
              select count(*)::int from flats f
              where f.society_id = sid and f.tower_id = any(p.target_tower_ids)
            )
            else flat_count
          end,
          'participation_pct', round(
            100.0 * coalesce(vc.votes, 0) / nullif(
              case
                when cardinality(p.target_flat_ids) > 0 then cardinality(p.target_flat_ids)
                when cardinality(p.target_tower_ids) > 0 then (
                  select count(*)::int from flats f
                  where f.society_id = sid and f.tower_id = any(p.target_tower_ids)
                )
                else flat_count
              end,
              0
            ),
            1
          ),
          'quorum_percent', p.quorum_percent,
          'quorum_met', (
            p.quorum_percent is not null
            and round(
              100.0 * coalesce(vc.votes, 0) / nullif(
                case
                  when cardinality(p.target_flat_ids) > 0 then cardinality(p.target_flat_ids)
                  when cardinality(p.target_tower_ids) > 0 then (
                    select count(*)::int from flats f
                    where f.society_id = sid and f.tower_id = any(p.target_tower_ids)
                  )
                  else flat_count
                end,
                0
              ),
              1
            ) >= p.quorum_percent
          )
        ) as row
        from polls p
        left join lateral (
          select count(distinct flat_id)::int as votes
          from poll_votes pv where pv.poll_id = p.id
        ) vc on true
        where p.society_id = sid
          and p.opens_at >= since
        order by p.opens_at desc
        limit 20
      ) rows
    ), '[]'::jsonb),
    'avg_participation_pct', (
      select round(avg((p->>'participation_pct')::numeric), 1)
      from jsonb_array_elements(
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'participation_pct', round(
              100.0 * coalesce(vc.votes, 0) / nullif(flat_count, 0), 1
            )
          ))
          from polls p
          left join lateral (
            select count(distinct flat_id)::int as votes
            from poll_votes pv where pv.poll_id = p.id
          ) vc on true
          where p.society_id = sid and p.opens_at >= since
        ), '[]'::jsonb)
      ) p
    )
  )
  into polls;

  -- Recompute polls object properly (avg from the polls array we just built)
  select jsonb_build_object(
    'days', days,
    'poll_count', jsonb_array_length(polls->'polls'),
    'avg_participation_pct', (
      select round(avg((elem->>'participation_pct')::numeric), 1)
      from jsonb_array_elements(polls->'polls') elem
      where (elem->>'participation_pct') is not null
    ),
    'polls', polls->'polls'
  ) into polls;

  -- #85 Guard performance
  select jsonb_build_object(
    'window_days', days,
    'summary', society_guard_attendance_summary(since, now() + interval '1 hour'),
    'by_guard', coalesce((
      select jsonb_agg(row order by (row->>'completed')::int desc, row->>'guard_name')
      from (
        select jsonb_build_object(
          'guard_id', s.guard_id,
          'guard_name', coalesce(p.name, 'Guard'),
          'scheduled', count(*) filter (where s.status = 'scheduled'),
          'checked_in', count(*) filter (where s.status = 'checked_in'),
          'completed', count(*) filter (where s.status = 'completed'),
          'missed', count(*) filter (where s.status = 'missed'),
          'cancelled', count(*) filter (where s.status = 'cancelled'),
          'completion_pct', round(
            100.0 * count(*) filter (where s.status = 'completed')
              / nullif(count(*) filter (where s.status in ('completed', 'missed', 'checked_in', 'scheduled')), 0),
            1
          )
        ) as row
        from guard_shifts s
        left join profiles p on p.id = s.guard_id
        where s.society_id = sid
          and s.starts_at >= since
        group by s.guard_id, p.name
        order by count(*) filter (where s.status = 'completed') desc
        limit 30
      ) rows
    ), '[]'::jsonb)
  )
  into guards;

  return jsonb_build_object(
    'days', days,
    'generated_at', now(),
    'traffic', coalesce(traffic, '{}'::jsonb),
    'approvals', coalesce(approvals, '{}'::jsonb),
    'complaints', coalesce(complaints, '{}'::jsonb),
    'amenities', coalesce(amenities, '{}'::jsonb),
    'dues', coalesce(dues, '{}'::jsonb),
    'polls', coalesce(polls, '{}'::jsonb),
    'guards', coalesce(guards, '{}'::jsonb)
  );
end;
$$;

revoke all on function society_analytics_bundle(integer) from public;
grant execute on function society_analytics_bundle(integer) to authenticated;
