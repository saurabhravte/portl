

create or replace function clerk_uid() returns text
language sql stable as $$ select nullif(auth.jwt()->>'sub','') $$;

-- security definer helpers avoid recursive RLS lookups on profiles
create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = clerk_uid() $$;

create or replace function my_society() returns uuid
language sql stable security definer set search_path = public as
$$ select society_id from profiles where id = clerk_uid() $$;

create or replace function my_flat() returns uuid
language sql stable security definer set search_path = public as
$$ select flat_id from profiles where id = clerk_uid() $$;

alter table societies enable row level security;
alter table towers enable row level security;
alter table flats enable row level security;
alter table profiles enable row level security;
alter table visitors enable row level security;
alter table visitor_requests enable row level security;
alter table gate_logs enable row level security;
alter table pre_approvals enable row level security;
alter table tickets enable row level security;
alter table notices enable row level security;
alter table notifications enable row level security;

-- profiles: read own row; admin reads/writes society rows
create policy profiles_self_read on profiles for select
  using (id = clerk_uid() or (my_role() = 'admin' and society_id = my_society()));
create policy profiles_self_token on profiles for update
  using (id = clerk_uid()) with check (id = clerk_uid());
create policy profiles_admin_write on profiles for all
  using (my_role() = 'admin' and society_id = my_society())
  with check (society_id = my_society());

-- society structure: everyone in the society can read; admin writes
create policy towers_read on towers for select using (society_id = my_society());
create policy towers_admin on towers for all
  using (my_role() = 'admin' and society_id = my_society()) with check (society_id = my_society());
create policy flats_read on flats for select using (society_id = my_society());
create policy flats_admin on flats for all
  using (my_role() = 'admin' and society_id = my_society()) with check (society_id = my_society());
create policy societies_read on societies for select using (id = my_society());

-- visitors: guard/admin see society; resident sees only own flat
create policy visitors_read on visitors for select using (
  society_id = my_society()
  and (my_role() in ('guard','admin') or flat_id = my_flat())
);
create policy visitors_insert_guard on visitors for insert
  with check (my_role() in ('guard','admin') and society_id = my_society());

-- visitor_requests: scoped through the visitor row
create policy requests_read on visitor_requests for select using (
  exists (select 1 from visitors v where v.id = visitor_id
    and v.society_id = my_society()
    and (my_role() in ('guard','admin') or v.flat_id = my_flat()))
);
create policy requests_insert_guard on visitor_requests for insert
  with check (my_role() in ('guard','admin'));
-- residents decide for their own flat; guards may only expire
create policy requests_decide_resident on visitor_requests for update using (
  my_role() = 'resident'
  and exists (select 1 from visitors v where v.id = visitor_id and v.flat_id = my_flat())
);
create policy requests_expire_guard on visitor_requests for update
  using (my_role() in ('guard','admin'))
  with check (status = 'expired');  -- a guard can never approve on a resident's behalf

-- gate logs: guard/admin write; residents read their flat's logs
create policy gate_read on gate_logs for select using (
  exists (select 1 from visitors v where v.id = visitor_id
    and v.society_id = my_society()
    and (my_role() in ('guard','admin') or v.flat_id = my_flat()))
);
create policy gate_write on gate_logs for insert with check (my_role() in ('guard','admin'));
create policy gate_update on gate_logs for update using (my_role() in ('guard','admin'));

-- pre-approvals: resident manages own flat; guard reads+redeems in society
create policy pre_resident on pre_approvals for all
  using (my_role() = 'resident' and flat_id = my_flat())
  with check (flat_id = my_flat());
create policy pre_guard_read on pre_approvals for select using (
  my_role() in ('guard','admin')
  and exists (select 1 from flats f where f.id = flat_id and f.society_id = my_society())
);
create policy pre_guard_redeem on pre_approvals for update using (my_role() in ('guard','admin'));

-- tickets: resident own flat; admin all in society
create policy tickets_resident on tickets for all
  using (my_role() = 'resident' and flat_id = my_flat()) with check (flat_id = my_flat());
create policy tickets_admin on tickets for all using (
  my_role() = 'admin'
  and exists (select 1 from flats f where f.id = flat_id and f.society_id = my_society())
);

-- notices: society read; admin write
create policy notices_read on notices for select using (society_id = my_society());
create policy notices_admin on notices for all
  using (my_role() = 'admin' and society_id = my_society()) with check (society_id = my_society());

-- notifications inbox: own rows only
create policy notif_own on notifications for all
  using (user_id = clerk_uid()) with check (user_id = clerk_uid());
