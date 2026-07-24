-- Apply after supabase/seed.sql with psql variables for real Clerk subjects:
-- psql "$DATABASE_URL" -v resident_id=user_... -v guard_id=user_... \
--   -v admin_id=user_... -f supabase/demo_seed.sql
\if :{?resident_id}
\else
  \echo 'resident_id is required (a Clerk user subject)'
  \quit 2
\endif
\if :{?guard_id}
\else
  \echo 'guard_id is required (a Clerk user subject)'
  \quit 2
\endif
\if :{?admin_id}
\else
  \echo 'admin_id is required (a Clerk user subject)'
  \quit 2
\endif

begin;

insert into profiles (id, society_id, role, flat_id, name, phone) values
  (:'resident_id', '11111111-1111-1111-1111-111111111111', 'resident',
   '33333333-3333-4333-8333-000000000001', 'Ravi Resident', null),
  (:'guard_id', '11111111-1111-1111-1111-111111111111', 'guard',
   null, 'Ganesh Guard', null),
  (:'admin_id', '11111111-1111-1111-1111-111111111111', 'admin',
   null, 'Anita Admin', null)
on conflict (id) do update set
  society_id = excluded.society_id,
  role = excluded.role,
  flat_id = excluded.flat_id,
  name = excluded.name;

insert into visitors (id, society_id, flat_id, type, name, phone, vehicle_no)
values (
  '66666666-6666-4666-8666-666666666661',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-4333-8333-000000000001',
  'delivery', 'Demo Courier', null, null
)
on conflict (id) do nothing;

insert into visitor_requests (id, visitor_id, raised_by, status)
values (
  '77777777-7777-4777-8777-777777777771',
  '66666666-6666-4666-8666-666666666661',
  :'guard_id', 'pending'
)
on conflict (id) do nothing;

insert into pre_approvals (
  id, flat_id, created_by, visitor_name, type, code, valid_from, valid_to
) values (
  '88888888-8888-4888-8888-888888888881',
  '33333333-3333-4333-8333-000000000001',
  :'resident_id', 'Demo Guest', 'guest', '424242',
  '2026-01-01 00:00:00+00', '2099-12-31 23:59:59+00'
)
on conflict (id) do nothing;

insert into tickets (id, flat_id, category, title, description, status)
values (
  '99999999-9999-4999-8999-999999999991',
  '33333333-3333-4333-8333-000000000001',
  'Electrical', 'Demo corridor light',
  'The corridor light outside A-101 is flickering.', 'open'
)
on conflict (id) do nothing;

insert into notices (
  id, society_id, title, body, audience, published_at, expires_at
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '11111111-1111-1111-1111-111111111111',
  'Demo water shutdown',
  'Water supply will pause from 10:00 to 11:00 for maintenance.',
  'all', '2026-07-19 06:00:00+00', '2099-12-31 23:59:59+00'
)
on conflict (id) do nothing;

insert into polls (id, society_id, question, options, created_by, closes_at)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  '11111111-1111-1111-1111-111111111111',
  'Choose the demo community event',
  '["Movie night", "Potluck"]'::jsonb,
  :'admin_id', '2099-12-31 23:59:59+00'
)
on conflict (id) do nothing;

insert into maintenance_dues (
  id, society_id, flat_id, period, amount, status
) values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-4333-8333-000000000001',
  '2026-07', 2500.00, 'due'
)
on conflict (id) do nothing;

commit;
