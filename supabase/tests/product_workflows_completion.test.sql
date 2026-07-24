begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create schema if not exists batch4_tests;
create or replace function batch4_tests.authenticate_as(uid text, headers jsonb default '{}'::jsonb)
returns void language plpgsql as $$
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
  perform set_config('request.headers',headers::text,true);
end $$;

insert into societies(id,name) values ('42222222-2222-4222-8222-222222222222','Batch Four');
insert into towers(id,society_id,name) values
 ('42222222-2222-4222-8222-222222222201','42222222-2222-4222-8222-222222222222','A'),
 ('42222222-2222-4222-8222-222222222202','42222222-2222-4222-8222-222222222222','B');
insert into flats(id,tower_id,society_id,number) values
 ('42222222-2222-4222-8222-222222222211','42222222-2222-4222-8222-222222222201','42222222-2222-4222-8222-222222222222','101'),
 ('42222222-2222-4222-8222-222222222212','42222222-2222-4222-8222-222222222202','42222222-2222-4222-8222-222222222222','201');
insert into profiles(id,society_id,role,flat_id,name) values
 ('batch4_admin','42222222-2222-4222-8222-222222222222','admin',null,'Admin'),
 ('batch4_guard','42222222-2222-4222-8222-222222222222','guard',null,'Guard'),
 ('batch4_resident_a','42222222-2222-4222-8222-222222222222','resident','42222222-2222-4222-8222-222222222211','A Resident'),
 ('batch4_resident_b','42222222-2222-4222-8222-222222222222','resident','42222222-2222-4222-8222-222222222212','B Resident');

select batch4_tests.authenticate_as('batch4_admin');
insert into notices(id,society_id,title,body,published_at,created_by,target_tower_ids)
values('42222222-2222-4222-8222-222222222221','42222222-2222-4222-8222-222222222222',
 'Later','Scheduled notice',now()+interval '1 hour','batch4_admin',
 array['42222222-2222-4222-8222-222222222201'::uuid]);
reset role;
select is((select count(*) from notifications
  where type='notice'
    and payload->>'noticeId'='42222222-2222-4222-8222-222222222221'),0::bigint,
  'scheduled notice does not notify on creation');
update notices set published_at=now()-interval '1 minute'
 where id='42222222-2222-4222-8222-222222222221';
select process_due_communications();
select is((select count(*) from notifications
  where type='notice'
    and payload->>'noticeId'='42222222-2222-4222-8222-222222222221'),1::bigint,
  'due notice targets only the selected tower');
select is((select user_id from notifications
  where type='notice'
    and payload->>'noticeId'='42222222-2222-4222-8222-222222222221'),'batch4_resident_a',
  'notice target resolves to the correct resident');
select ok((select notified_at is not null from notices where id='42222222-2222-4222-8222-222222222221'),
  'notice dispatch is durably marked');

insert into polls(id,society_id,question,options,created_by,opens_at,closes_at)
values('42222222-2222-4222-8222-222222222231','42222222-2222-4222-8222-222222222222',
 'Choose?','["One","Two"]','batch4_admin',now()-interval '1 minute',now()+interval '1 day');
select batch4_tests.authenticate_as('batch4_resident_a');
select throws_ok(
  $$insert into poll_votes(poll_id,voter_id,flat_id,option_index) values(
    '42222222-2222-4222-8222-222222222231','batch4_resident_a',
    '42222222-2222-4222-8222-222222222211',2)$$,
  '22023',null,'poll option bounds are enforced by the database');
insert into poll_votes(poll_id,voter_id,flat_id,option_index) values(
 '42222222-2222-4222-8222-222222222231','batch4_resident_a',
 '42222222-2222-4222-8222-222222222211',1);
reset role;
select is((select option_index from poll_votes where poll_id='42222222-2222-4222-8222-222222222231'),
  1,'a valid poll option is accepted');

insert into amenities(id,society_id,name,requires_approval)
values('42222222-2222-4222-8222-222222222241','42222222-2222-4222-8222-222222222222','Hall',true);
insert into amenity_bookings(id,amenity_id,flat_id,booked_by,starts_at,ends_at,status)
values('42222222-2222-4222-8222-222222222242','42222222-2222-4222-8222-222222222241',
 '42222222-2222-4222-8222-222222222211','batch4_resident_a',now()+interval '2 days',
 now()+interval '2 days 1 hour','pending');
select batch4_tests.authenticate_as('batch4_admin');
select lives_ok($$select decide_amenity_booking(
 '42222222-2222-4222-8222-222222222242','rejected','Private event conflict')$$,
 'admin can reject a pending booking through the constrained RPC');
reset role;
select ok((select status='rejected' and decided_by='batch4_admin' and decided_at is not null
 from amenity_bookings where id='42222222-2222-4222-8222-222222222242'),
 'booking decision records actor and time');
select is((select count(*) from amenity_booking_events
 where booking_id='42222222-2222-4222-8222-222222222242'),2::bigint,
 'booking creation and decision are retained in history');
select ok(exists(select 1 from notifications where user_id='batch4_resident_a' and type='amenity_booking'),
 'resident receives the amenity decision');

select batch4_tests.authenticate_as('batch4_guard');
select lives_ok($$select register_guard_device(
 '42222222-guard-device-0001','Test handset',null,null)$$,
 'guard can register a new device');
reset role;
select batch4_tests.authenticate_as('batch4_admin');
select revoke_guard_device(
 (select id from guard_device_sessions where guard_id='batch4_guard'),
 'Handset was replaced'
);
reset role;
select batch4_tests.authenticate_as('batch4_guard');
select throws_ok(
 $$select register_guard_device('42222222-guard-device-0001','Test handset',null,null)$$,
 '42501',null,'guard cannot self-reactivate a revoked device');
reset role;

select * from finish();
rollback;
