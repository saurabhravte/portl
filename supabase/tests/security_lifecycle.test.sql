begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

create schema if not exists security_tests;
create or replace function security_tests.authenticate_as(uid text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

-- Publication and bucket configuration are release invariants.
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ),
  'notifications is in the realtime publication'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'visitor_requests'
  ),
  'visitor_requests is in the realtime publication'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gate_logs'
  ),
  'gate_logs is in the realtime publication'
);
select is(
  (select public from storage.buckets where id = 'society-media'),
  false,
  'society-media is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'society-media'),
  5242880::bigint,
  'society-media has a five MiB limit'
);
select ok(
  (select allowed_mime_types @> array['image/jpeg']::text[]
     from storage.buckets where id = 'society-media'),
  'society-media allows image MIME types'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tickets'
      and policyname = 'tickets_resident'
  ),
  'the broad resident ticket policy is removed'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pre_approvals'
      and policyname = 'pre_resident'
  ),
  'the broad resident pass policy is removed'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'society_media_update'
  ),
  'media objects cannot be replaced or renamed'
);

insert into societies(id, name) values
  ('20202020-2020-4020-8020-202020202001', 'Security A'),
  ('20202020-2020-4020-8020-202020202002', 'Security B');
insert into towers(id, society_id, name) values
  ('20202020-2020-4020-8020-202020202011', '20202020-2020-4020-8020-202020202001', 'A'),
  ('20202020-2020-4020-8020-202020202012', '20202020-2020-4020-8020-202020202002', 'B');
insert into flats(id, tower_id, society_id, number) values
  ('20202020-2020-4020-8020-202020202021', '20202020-2020-4020-8020-202020202011', '20202020-2020-4020-8020-202020202001', '101'),
  ('20202020-2020-4020-8020-202020202022', '20202020-2020-4020-8020-202020202012', '20202020-2020-4020-8020-202020202002', '201');
insert into profiles(id, society_id, role, flat_id, name) values
  ('security_resident', '20202020-2020-4020-8020-202020202001', 'resident', '20202020-2020-4020-8020-202020202021', 'Resident'),
  ('security_guard', '20202020-2020-4020-8020-202020202001', 'guard', null, 'Guard'),
  ('security_admin', '20202020-2020-4020-8020-202020202001', 'admin', null, 'Admin'),
  ('security_other_resident', '20202020-2020-4020-8020-202020202002', 'resident', '20202020-2020-4020-8020-202020202022', 'Other');

-- Ticket permissions preserve the app's resident/admin transition flow.
select security_tests.authenticate_as('security_resident');
insert into tickets(id, flat_id, category, title)
values (
  '20202020-2020-4020-8020-202020202031',
  '20202020-2020-4020-8020-202020202021',
  'Plumbing',
  'Secure ticket'
);
reset role;
select is(
  (select status from tickets where id = '20202020-2020-4020-8020-202020202031'),
  'open',
  'a resident can create an open ticket for their flat'
);

select security_tests.authenticate_as('security_resident');
update tickets set title = 'Tampered'
where id = '20202020-2020-4020-8020-202020202031';
update tickets set status = 'in_progress'
where id = '20202020-2020-4020-8020-202020202031';
reset role;
select is(
  (select title from tickets where id = '20202020-2020-4020-8020-202020202031'),
  'Secure ticket',
  'a resident cannot rewrite ticket content'
);
select is(
  (select status from tickets where id = '20202020-2020-4020-8020-202020202031'),
  'open',
  'a resident cannot start work on a ticket'
);

select security_tests.authenticate_as('security_admin');
update tickets set status = 'in_progress'
where id = '20202020-2020-4020-8020-202020202031';
reset role;
select is(
  (select status from tickets where id = '20202020-2020-4020-8020-202020202031'),
  'in_progress',
  'an admin can start ticket work'
);
select security_tests.authenticate_as('security_admin');
update tickets set status = 'resolved'
where id = '20202020-2020-4020-8020-202020202031';
reset role;
select ok(
  (select status = 'resolved' and resolved_at is not null
     from tickets where id = '20202020-2020-4020-8020-202020202031'),
  'an admin can resolve a ticket and stamp resolution'
);
select security_tests.authenticate_as('security_resident');
update tickets set status = 'closed'
where id = '20202020-2020-4020-8020-202020202031';
reset role;
select ok(
  (select status = 'closed' and closed_at is not null
     from tickets where id = '20202020-2020-4020-8020-202020202031'),
  'the resident can confirm a resolved ticket'
);

-- Pass rows are immutable to direct clients after creation; RPCs own lifecycle.
select security_tests.authenticate_as('security_resident');
insert into pre_approvals(
  id, flat_id, created_by, visitor_name, type, code, valid_from, valid_to
) values (
  '20202020-2020-4020-8020-202020202041',
  '20202020-2020-4020-8020-202020202021',
  'security_resident',
  'Expected Guest',
  'guest',
  '202041',
  now() - interval '1 minute',
  now() + interval '1 hour'
);
reset role;
select ok(
  exists (
    select 1 from pre_approvals
    where id = '20202020-2020-4020-8020-202020202041'
  ),
  'a resident can create a scoped gate pass'
);
select security_tests.authenticate_as('security_resident');
update pre_approvals set used_at = now()
where id = '20202020-2020-4020-8020-202020202041';
reset role;
select is(
  (select used_at from pre_approvals
    where id = '20202020-2020-4020-8020-202020202041'),
  null::timestamptz,
  'a resident cannot directly redeem a pass'
);
select security_tests.authenticate_as('security_resident');
delete from pre_approvals
where id = '20202020-2020-4020-8020-202020202041';
reset role;
select ok(
  exists (
    select 1 from pre_approvals
    where id = '20202020-2020-4020-8020-202020202041'
  ),
  'a resident cannot erase pass audit history'
);

-- Dues enforce ledger immutability and claim confirmation.
insert into maintenance_dues(
  id, society_id, flat_id, period, amount
) values (
  '20202020-2020-4020-8020-202020202051',
  '20202020-2020-4020-8020-202020202001',
  '20202020-2020-4020-8020-202020202021',
  '2026-08',
  1500
);
select security_tests.authenticate_as('security_resident');
select throws_ok(
  $$update maintenance_dues
       set status = 'claimed',
           amount = 1,
           claimed_at = now(),
           claimed_by = 'security_resident'
     where id = '20202020-2020-4020-8020-202020202051'$$,
  '42501', null,
  'claiming a due cannot alter its amount'
);
update maintenance_dues
   set status = 'claimed',
       claimed_at = now(),
       claimed_by = 'security_resident'
 where id = '20202020-2020-4020-8020-202020202051';
reset role;
select is(
  (select status from maintenance_dues
    where id = '20202020-2020-4020-8020-202020202051'),
  'claimed',
  'a resident can claim an unchanged due'
);
select security_tests.authenticate_as('security_admin');
update maintenance_dues
   set status = 'paid',
       paid_at = now(),
       confirmed_by = 'security_admin'
 where id = '20202020-2020-4020-8020-202020202051';
reset role;
select is(
  (select status from maintenance_dues
    where id = '20202020-2020-4020-8020-202020202051'),
  'paid',
  'an admin can confirm a claimed payment'
);

-- Booking and shift RPCs remain usable while terminal rows stay immutable.
insert into amenities(
  id, society_id, name, open_time, close_time, slot_minutes
) values (
  '20202020-2020-4020-8020-202020202061',
  '20202020-2020-4020-8020-202020202001',
  'Test room',
  '00:00',
  '23:59',
  60
);
insert into amenity_bookings(
  id, amenity_id, flat_id, booked_by, starts_at, ends_at, status
) values (
  '20202020-2020-4020-8020-202020202062',
  '20202020-2020-4020-8020-202020202061',
  '20202020-2020-4020-8020-202020202021',
  'security_resident',
  now() + interval '2 days',
  now() + interval '2 days 1 hour',
  'confirmed'
);
select security_tests.authenticate_as('security_resident');
select lives_ok(
  $$select cancel_my_amenity_booking(
    '20202020-2020-4020-8020-202020202062'
  )$$,
  'the resident cancellation RPC remains valid'
);
reset role;

insert into gates(id, society_id, name) values (
  '20202020-2020-4020-8020-202020202071',
  '20202020-2020-4020-8020-202020202001',
  'Main'
);
insert into guard_shifts(
  id, society_id, guard_id, gate_id, starts_at, ends_at
) values (
  '20202020-2020-4020-8020-202020202072',
  '20202020-2020-4020-8020-202020202001',
  'security_guard',
  '20202020-2020-4020-8020-202020202071',
  now() - interval '1 hour',
  now() + interval '1 hour'
);
select security_tests.authenticate_as('security_guard');
select lives_ok(
  $$select update_my_guard_shift_status(
    '20202020-2020-4020-8020-202020202072',
    'checked_in'
  )$$,
  'a guard can check in through the RPC'
);
select lives_ok(
  $$select update_my_guard_shift_status(
    '20202020-2020-4020-8020-202020202072',
    'completed'
  )$$,
  'a checked-in guard can complete the shift'
);
select throws_ok(
  $$select update_my_guard_shift_status(
    '20202020-2020-4020-8020-202020202072',
    'completed'
  )$$,
  'P0001', null,
  'a completed shift cannot transition again'
);
reset role;

-- Ballots freeze once open; notices cannot target another society.
insert into polls(
  id, society_id, question, options, created_by, opens_at, closes_at
) values (
  '20202020-2020-4020-8020-202020202081',
  '20202020-2020-4020-8020-202020202001',
  'Open ballot?',
  '["Yes","No"]',
  'security_admin',
  now() - interval '1 minute',
  now() + interval '1 day'
);
select security_tests.authenticate_as('security_admin');
select throws_ok(
  $$update polls set question = 'Changed ballot?'
    where id = '20202020-2020-4020-8020-202020202081'$$,
  '23514', null,
  'an open poll ballot cannot be edited'
);
update polls
   set closed_at = now(), closed_by = 'security_admin'
 where id = '20202020-2020-4020-8020-202020202081';
reset role;
select ok(
  (select closed_at is not null and closed_by = 'security_admin'
     from polls where id = '20202020-2020-4020-8020-202020202081'),
  'an admin can close an open poll without changing its ballot'
);
select security_tests.authenticate_as('security_admin');
select throws_ok(
  $$insert into notices(
       society_id, title, body, published_at, created_by, target_flat_ids
     ) values (
       '20202020-2020-4020-8020-202020202001',
       'Bad target',
       'Cross-tenant target',
       now(),
       'security_admin',
       array['20202020-2020-4020-8020-202020202022'::uuid]
     )$$,
  '23514', null,
  'a notice cannot target a flat in another society'
);
reset role;

-- Storage SQL policies mirror src/lib/photos.ts:
-- <society>/<visitors|tickets>/<clerk-user>-<milliseconds>.jpg
select security_tests.authenticate_as('security_guard');
insert into storage.objects(bucket_id, name, metadata) values (
  'society-media',
  '20202020-2020-4020-8020-202020202001/visitors/security_guard-1720000000000.jpg',
  '{"mimetype":"image/jpeg","size":1024}'::jsonb
);
reset role;
select ok(
  exists (
    select 1 from storage.objects
    where name = '20202020-2020-4020-8020-202020202001/visitors/security_guard-1720000000000.jpg'
  ),
  'guards can upload visitor images using the app path'
);
select security_tests.authenticate_as('security_resident');
insert into storage.objects(bucket_id, name, metadata) values (
  'society-media',
  '20202020-2020-4020-8020-202020202001/tickets/security_resident-1720000000001.jpg',
  '{"mimetype":"image/jpeg","size":2048}'::jsonb
);
reset role;
select ok(
  exists (
    select 1 from storage.objects
    where name = '20202020-2020-4020-8020-202020202001/tickets/security_resident-1720000000001.jpg'
  ),
  'residents can upload ticket images using the app path'
);

select security_tests.authenticate_as('security_guard');
select throws_ok(
  $$insert into storage.objects(bucket_id, name, metadata) values (
    'society-media',
    '20202020-2020-4020-8020-202020202001/visitors/extra/security_guard-1720000000002.jpg',
    '{"mimetype":"image/jpeg","size":10}'::jsonb
  )$$,
  '42501', null,
  'media paths must contain exactly three segments'
);
reset role;
select security_tests.authenticate_as('security_resident');
select throws_ok(
  $$insert into storage.objects(bucket_id, name, metadata) values (
    'society-media',
    '20202020-2020-4020-8020-202020202001/visitors/security_resident-1720000000003.jpg',
    '{"mimetype":"image/jpeg","size":10}'::jsonb
  )$$,
  '42501', null,
  'residents cannot upload visitor media'
);
select throws_ok(
  $$insert into storage.objects(bucket_id, name, metadata) values (
    'society-media',
    '20202020-2020-4020-8020-202020202001/tickets/security_guard-1720000000004.jpg',
    '{"mimetype":"image/jpeg","size":10}'::jsonb
  )$$,
  '42501', null,
  'upload filenames must be owned by the caller'
);
select throws_ok(
  $$insert into storage.objects(bucket_id, name, metadata) values (
    'society-media',
    '20202020-2020-4020-8020-202020202001/tickets/security_resident-1720000000005.jpg',
    '{"mimetype":"application/pdf","size":10}'::jsonb
  )$$,
  '42501', null,
  'non-image media is rejected'
);
select throws_ok(
  $$insert into storage.objects(bucket_id, name, metadata) values (
    'society-media',
    '20202020-2020-4020-8020-202020202001/tickets/security_resident-1720000000006.jpg',
    '{"mimetype":"image/jpeg","size":5242881}'::jsonb
  )$$,
  '42501', null,
  'oversized media is rejected'
);
select is(
  (
    select count(*) from storage.objects
    where name = '20202020-2020-4020-8020-202020202001/visitors/security_guard-1720000000000.jpg'
  ),
  0::bigint,
  'unlinked visitor media is hidden from residents'
);
reset role;
insert into visitors(
  id, society_id, flat_id, type, name, photo_url
) values (
  '20202020-2020-4020-8020-202020202091',
  '20202020-2020-4020-8020-202020202001',
  '20202020-2020-4020-8020-202020202021',
  'guest',
  'Linked Photo Guest',
  'society-media:20202020-2020-4020-8020-202020202001/visitors/security_guard-1720000000000.jpg'
);
select security_tests.authenticate_as('security_resident');
select is(
  (
    select count(*) from storage.objects
    where name = '20202020-2020-4020-8020-202020202001/visitors/security_guard-1720000000000.jpg'
  ),
  1::bigint,
  'linked visitor media is visible to the resident flat'
);
reset role;

-- Overrides are reserved for unanswered/expired requests, not denials.
insert into visitors(id, society_id, flat_id, type, name) values
  ('20202020-2020-4020-8020-202020202092', '20202020-2020-4020-8020-202020202001', '20202020-2020-4020-8020-202020202021', 'guest', 'Denied Guest'),
  ('20202020-2020-4020-8020-202020202093', '20202020-2020-4020-8020-202020202001', '20202020-2020-4020-8020-202020202021', 'guest', 'Pending Guest');
insert into visitor_requests(
  id, visitor_id, raised_by, status, decided_by, decided_at
) values (
  '20202020-2020-4020-8020-202020202094',
  '20202020-2020-4020-8020-202020202092',
  'security_guard',
  'denied',
  'security_resident',
  now()
);
insert into visitor_requests(id, visitor_id, raised_by) values (
  '20202020-2020-4020-8020-202020202095',
  '20202020-2020-4020-8020-202020202093',
  'security_guard'
);
select security_tests.authenticate_as('security_admin');
select throws_ok(
  $$select admin_override_entry(
    '20202020-2020-4020-8020-202020202096',
    '20202020-2020-4020-8020-202020202094',
    'Rejected request'
  )$$,
  '23514', null,
  'an admin cannot override a resident denial'
);
select lives_ok(
  $$select admin_override_entry(
    '20202020-2020-4020-8020-202020202097',
    '20202020-2020-4020-8020-202020202095',
    'Resident unavailable'
  )$$,
  'an admin can override a pending request with a reason'
);
select is(
  admin_override_entry(
    '20202020-2020-4020-8020-202020202097',
    '20202020-2020-4020-8020-202020202095',
    'Resident unavailable'
  )->>'gate_log_id',
  (
    select id::text from gate_logs
    where visitor_id = '20202020-2020-4020-8020-202020202093'
  ),
  'replaying an admin override returns the original gate log'
);
reset role;

select * from finish();
rollback;
