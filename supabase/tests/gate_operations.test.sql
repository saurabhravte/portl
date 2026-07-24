begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create schema if not exists gate_ops_tests;
create or replace function gate_ops_tests.authenticate_as(uid text) returns void
language plpgsql as $$
begin
  perform set_config('role','authenticated',true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub',uid,'role','authenticated')::text,
    true
  );
  perform set_config(
    'request.headers',
    '{"x-portl-device-id":"gate-ops-test-device-0001"}',
    true
  );
end $$;

insert into societies(id,name) values
  ('18181818-1818-4181-8181-181818181801','Gate Ops A'),
  ('18181818-1818-4181-8181-181818181802','Gate Ops B');
insert into towers(id,society_id,name) values
  ('18181818-1818-4181-8181-181818181811','18181818-1818-4181-8181-181818181801','A'),
  ('18181818-1818-4181-8181-181818181812','18181818-1818-4181-8181-181818181802','B');
insert into flats(id,tower_id,society_id,number) values
  ('18181818-1818-4181-8181-181818181821','18181818-1818-4181-8181-181818181811','18181818-1818-4181-8181-181818181801','101'),
  ('18181818-1818-4181-8181-181818181822','18181818-1818-4181-8181-181818181812','18181818-1818-4181-8181-181818181802','201');
insert into profiles(id,society_id,role,flat_id,name) values
  ('gate_ops_guard','18181818-1818-4181-8181-181818181801','guard',null,'Guard'),
  ('gate_ops_resident','18181818-1818-4181-8181-181818181801','resident','18181818-1818-4181-8181-181818181821','Resident');
insert into guard_device_sessions(
  society_id,guard_id,device_id,device_name,status,last_seen_at
) values (
  '18181818-1818-4181-8181-181818181801',
  'gate_ops_guard',
  'gate-ops-test-device-0001',
  'Test device',
  'active',
  now()
);

select gate_ops_tests.authenticate_as('gate_ops_guard');
select is(
  raise_visitor_request(
    '18181818-1818-4181-8181-181818181831',
    '18181818-1818-4181-8181-181818181821',
    'Idempotent Guest','guest'
  )->>'requestId',
  raise_visitor_request(
    '18181818-1818-4181-8181-181818181831',
    '18181818-1818-4181-8181-181818181821',
    'Idempotent Guest','guest'
  )->>'requestId',
  'replaying a raise returns the same request'
);
reset role;
select is((select count(*) from visitors where name='Idempotent Guest'),1::bigint,'one visitor is created');
select is((
  select count(*) from visitor_requests r join visitors v on v.id=r.visitor_id
  where v.name='Idempotent Guest'
),1::bigint,'one request is created');

select gate_ops_tests.authenticate_as('gate_ops_guard');
select throws_ok(
  $$select raise_visitor_request(
    '18181818-1818-4181-8181-181818181832',
    '18181818-1818-4181-8181-181818181822',
    'Cross Society','guest'
  )$$,
  '42501',null,'a guard cannot target another society'
);
reset role;

select gate_ops_tests.authenticate_as('gate_ops_resident');
select is(
  decide_visitor_request(
    '18181818-1818-4181-8181-181818181833',
    (select r.id from visitor_requests r join visitors v on v.id=r.visitor_id where v.name='Idempotent Guest'),
    'approved'
  )->>'status',
  decide_visitor_request(
    '18181818-1818-4181-8181-181818181833',
    (select r.id from visitor_requests r join visitors v on v.id=r.visitor_id where v.name='Idempotent Guest'),
    'approved'
  )->>'status',
  'replaying a resident decision returns the original result'
);
reset role;

select gate_ops_tests.authenticate_as('gate_ops_guard');
select is(
  mark_visitor_entry(
    '18181818-1818-4181-8181-181818181834',
    (select r.id from visitor_requests r join visitors v on v.id=r.visitor_id where v.name='Idempotent Guest')
  )->>'gateLogId',
  mark_visitor_entry(
    '18181818-1818-4181-8181-181818181834',
    (select r.id from visitor_requests r join visitors v on v.id=r.visitor_id where v.name='Idempotent Guest')
  )->>'gateLogId',
  'replaying entry returns the same gate log'
);
reset role;
select is((
  select count(*) from gate_logs g join visitors v on v.id=g.visitor_id
  where v.name='Idempotent Guest'
),1::bigint,'one entry log is created');

select gate_ops_tests.authenticate_as('gate_ops_guard');
select is(
  mark_visitor_exit(
    '18181818-1818-4181-8181-181818181835',
    (select g.id from gate_logs g join visitors v on v.id=g.visitor_id where v.name='Idempotent Guest')
  )->>'exited',
  mark_visitor_exit(
    '18181818-1818-4181-8181-181818181835',
    (select g.id from gate_logs g join visitors v on v.id=g.visitor_id where v.name='Idempotent Guest')
  )->>'exited',
  'replaying exit returns the same result'
);
reset role;
select ok((
  select g.exit_at is not null from gate_logs g join visitors v on v.id=g.visitor_id
  where v.name='Idempotent Guest'
),'entry is closed exactly once');
select ok(
  not has_table_privilege('authenticated','gate_operations','select'),
  'clients cannot inspect operation tracking rows'
);

select * from finish();
rollback;
