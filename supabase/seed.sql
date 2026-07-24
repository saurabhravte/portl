-- Deterministic, identity-free baseline for local development.
-- Role profiles and workflow records require real Clerk subject IDs and are
-- intentionally kept in demo_seed.sql.
insert into societies (id, name, address, calendar_feed_token)
values (
  '11111111-1111-1111-1111-111111111111',
  'SR Heights',
  'Raipur, CG',
  'localdevcalendartoken000000000001'
)
on conflict do nothing;

insert into towers (id, society_id, name) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'A'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'B')
on conflict do nothing;

insert into flats (id, tower_id, society_id, number)
select
  ('33333333-3333-4333-8333-' || lpad((t.id_offset + n)::text, 12, '0'))::uuid,
  t.id,
  '11111111-1111-1111-1111-111111111111',
  t.prefix || lpad(n::text, 2, '0')
from (values
  ('22222222-2222-2222-2222-222222222221'::uuid, 'A-1', 0),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'B-1', 100)
) as t(id, prefix, id_offset), generate_series(1, 10) n
on conflict do nothing;

insert into amenities (id, society_id, name, description, open_time, close_time)
values
  ('44444444-4444-4444-8444-444444444441', '11111111-1111-1111-1111-111111111111',
   'Clubhouse', 'Indoor community hall', '08:00', '22:00'),
  ('44444444-4444-4444-8444-444444444442', '11111111-1111-1111-1111-111111111111',
   'Badminton Court', 'One indoor court', '06:00', '21:00')
on conflict do nothing;

insert into staff (id, society_id, name, category, phone)
values
  ('55555555-5555-4555-8555-555555555551', '11111111-1111-1111-1111-111111111111',
   'Demo Electrician', 'electrician', null),
  ('55555555-5555-4555-8555-555555555552', '11111111-1111-1111-1111-111111111111',
   'Demo Plumber', 'plumber', null)
on conflict do nothing;
