begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create schema if not exists batch5_tests;
create or replace function batch5_tests.authenticate_as(uid text)
returns void language plpgsql as $$
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
end $$;

insert into societies(id,name,settings) values
 ('52300000-0000-4000-8000-000000000001','Batch Five','{"accountDeletionGraceDays":14}');
insert into towers(id,society_id,name) values
 ('52300000-0000-4000-8000-000000000011','52300000-0000-4000-8000-000000000001','Alpha'),
 ('52300000-0000-4000-8000-000000000012','52300000-0000-4000-8000-000000000001','Beta');
insert into flats(id,tower_id,society_id,number) values
 ('52300000-0000-4000-8000-000000000021','52300000-0000-4000-8000-000000000011','52300000-0000-4000-8000-000000000001','101');
insert into profiles(id,society_id,role,flat_id,name,phone,email) values
 ('batch5_admin','52300000-0000-4000-8000-000000000001','admin',null,'Admin','+919999999999','admin@example.test'),
 ('batch5_resident','52300000-0000-4000-8000-000000000001','resident','52300000-0000-4000-8000-000000000021','Resident','+918888888888','resident@example.test');

select batch5_tests.authenticate_as('batch5_resident');
select throws_ok(
  $$select admin_dataset_page('flats',10,null,null,'{}')$$,
  '42501',null,'resident cannot browse admin datasets');
reset role;

select batch5_tests.authenticate_as('batch5_admin');
select is(
  (admin_dataset_page('towers',1,null,null,'{}')->>'total_count')::integer,
  2,'admin dataset returns an exact filtered count');
select is(
  jsonb_array_length(admin_dataset_page('towers',1,null,null,'{}')->'rows'),
  1,'admin dataset enforces the requested bound');
select ok(
  admin_dataset_page('towers',1,null,null,'{}')->'next_cursor' is not null,
  'admin dataset returns a stable cursor');
select is(
  (admin_dataset_page('flats',10,null,'101','{"occupancy_status":"occupied"}')->>'total_count')::integer,
  1,'admin dataset applies search and filters on the server');

select is(
  import_flats_transactional(
    'batch5-preview-key',
    '[{"line":1,"tower":" alpha ","flat":"102"},{"line":2,"tower":"Gamma","flat":"301"}]',
    true,true
  )->>'status',
  'validated','flat import supports a non-mutating dry run');
select is((select count(*) from towers where lower(name)='gamma'),0::bigint,
  'dry run creates no towers');
select is(
  import_flats_transactional(
    'batch5-apply-key',
    '[{"line":1,"tower":" ALPHA ","flat":"102"},{"line":2,"tower":"Gamma","flat":"301"}]',
    false,true
  )->>'status',
  'applied','valid flat import applies atomically');
select is((select count(*) from flats where society_id='52300000-0000-4000-8000-000000000001'),3::bigint,
  'flat import creates every valid row');
select is(
  import_flats_transactional(
    'batch5-apply-key',
    '[{"line":1,"tower":"changed","flat":"999"}]',
    false,true
  )->>'idempotent_replay',
  'true','flat import replays the authoritative result for the same key');
select is(
  import_flats_transactional(
    'batch5-invalid-key',
    '[{"line":0,"tower":"","flat":"9"},{"line":2,"tower":"Delta","flat":"401"}]',
    false,true
  )->>'status',
  'rejected','all-or-nothing import rejects a mixed batch');
select is((select count(*) from towers where lower(name)='delta'),0::bigint,
  'rejected all-or-nothing import writes nothing');

update profiles set role='guard' where id='batch5_resident';
reset role;
select ok(exists(select 1 from admin_audit_events
  where target_type='profiles' and target_id='batch5_resident' and action='update'),
  'admin changes append an audit event');
select ok(not exists(select 1 from admin_audit_events
  where target_id='batch5_resident'
    and (before_state ? 'phone' or after_state ? 'email' or after_state ? 'name')),
  'profile audit payload excludes personal fields');
select throws_ok(
  $$update admin_audit_events set action='tampered' where target_id='batch5_resident'$$,
  '42501',null,'audit events cannot be updated');

select batch5_tests.authenticate_as('batch5_resident');
select ok(request_personal_data_export() is not null,
  'a user can request a personal data export');
reset role;
insert into push_tokens(user_id,token,platform)
values('batch5_resident','ExponentPushToken[batch5]','android');
select batch5_tests.authenticate_as('batch5_resident');
select ok(request_account_deletion() is not null,
  'a user can request account deletion using society policy');
reset role;
select ok(
  not exists(select 1 from push_tokens where user_id='batch5_resident')
  and exists(select 1 from account_deletion_requests
    where profile_id='batch5_resident'
      and execute_after between requested_at+interval '13 days' and requested_at+interval '15 days'),
  'deletion immediately revokes push and uses configured grace');

select batch5_tests.authenticate_as('batch5_admin');
select ok((admin_audit_page(10,null,null,null,null)->>'total_count')::integer>0,
  'admins can browse the immutable audit through a bounded RPC');
select ok(set_privacy_legal_hold('batch5_resident','account_deletion','litigation',true) is not null,
  'admin can place a coded legal hold');
reset role;
insert into export_artifacts(
  id,society_id,owner_id,kind,storage_path,status,expires_at
) values(
  '52300000-0000-4000-8000-000000000099','52300000-0000-4000-8000-000000000001',
  'batch5_resident','personal_json','test/held.json','ready',now()-interval '1 day'
);
select is((run_privacy_retention_cleanup(10,false)->>'affected')::integer,0,
  'retention cleanup respects an active legal hold');
select batch5_tests.authenticate_as('batch5_admin');
select set_privacy_legal_hold('batch5_resident','account_deletion','litigation',false);
reset role;
select is((run_privacy_retention_cleanup(10,false)->>'affected')::integer,1,
  'retention cleanup expires an artifact after hold release');

select * from finish();
rollback;
