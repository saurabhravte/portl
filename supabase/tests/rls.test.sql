-- RLS isolation test suite (sprint ticket #2 — P0, the plan's Phase 1
-- exit criterion). Run with the Supabase CLI against a local stack:
--
--   supabase start
--   supabase test db
--
-- Simulates three role JWTs (resident A, resident B in another flat, a
-- guard, and an admin) by setting request.jwt.claims, and asserts that
-- Postgres — not the UI — enforces isolation:
--   * a resident cannot read another flat's requests, tickets, or dues
--   * a guard can never approve on a resident's behalf
--   * a resident cannot mark their own dues 'paid' (only 'claimed')
--   * poll votes are one per flat

begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ── Fixtures (as superuser, RLS not applied to the owner) ────────────
-- IDs must not collide with supabase/seed.sql (society 1111…, towers 2222…).
create schema if not exists tests;

insert into societies (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Society');
insert into towers (id, society_id, name)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T1');
insert into flats (id, tower_id, society_id, number) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '101'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '102');

insert into profiles (id, society_id, role, flat_id, name) values
  ('user_res_a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'resident', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Resident A'),
  ('user_res_b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'resident', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 'Resident B'),
  ('user_guard', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'guard', null, 'Guard G'),
  ('user_admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', null, 'Admin M');

insert into societies (id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'Other Society');
insert into towers (id, society_id, name)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'Other T1');
insert into flats (id, tower_id, society_id, number)
  values (
    'cccccccc-cccc-cccc-cccc-ccccccccccc3',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
    '201'
  );
insert into profiles (id, society_id, role, flat_id, name) values
  ('user_other_guard', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'guard', null, 'Other Guard');

-- Visitor + pending request for flat 101 (resident A's flat)
insert into visitors (id, society_id, flat_id, type, name)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'guest', 'Visitor V');
insert into visitor_requests (id, visitor_id, raised_by, status)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'user_guard', 'pending');

insert into visitors (id, society_id, flat_id, type, name)
  values (
    'dddddddd-dddd-dddd-dddd-ddddddddddde',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
    'cccccccc-cccc-cccc-cccc-ccccccccccc3',
    'guest',
    'Other Visitor'
  );
insert into visitor_requests (
  id, visitor_id, raised_by, status, decided_by, decided_at
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef',
  'dddddddd-dddd-dddd-dddd-ddddddddddde',
  'user_other_guard',
  'approved',
  'user_other_guard',
  now()
);

insert into invites (
  id, society_id, phone, name, role, flat_id, created_by
) values (
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '+91 98000 00999',
  'Invited Resident',
  'resident',
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'user_admin'
);

-- Ticket + due for flat 101
insert into tickets (id, flat_id, category, title)
  values ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Plumbing', 'Leaky tap');
insert into maintenance_dues (id, society_id, flat_id, period, amount)
  values ('ffffffff-ffff-ffff-ffff-fffffffffff2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', '2026-07', 1000);

-- Poll
insert into polls (id, society_id, question, options, created_by, closes_at)
  values ('ffffffff-ffff-ffff-ffff-fffffffffff3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Repaint lobby?', '["Yes","No"]', 'user_admin', now() + interval '7 days');

-- ── Helper: assume a role JWT ────────────────────────────────────────
create or replace function tests.authenticate_as(uid text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- ── Resident B (other flat) must be blind to flat 101's data ─────────
select tests.authenticate_as('user_res_b');

select is(
  (select count(*) from visitor_requests where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  0::bigint,
  'resident B cannot read another flat''s visitor request');

select is(
  (select count(*) from tickets where id = 'ffffffff-ffff-ffff-ffff-fffffffffff1'),
  0::bigint,
  'resident B cannot read another flat''s ticket');

select is(
  (select count(*) from maintenance_dues where id = 'ffffffff-ffff-ffff-ffff-fffffffffff2'),
  0::bigint,
  'resident B cannot read another flat''s dues');

-- Resident B cannot decide flat 101's request (update matches 0 rows)
update visitor_requests set status = 'approved', decided_by = 'user_res_b', decided_at = now()
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
reset role;
select is(
  (select status from visitor_requests where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'pending',
  'resident B''s approval attempt on another flat is a no-op');

-- ── Resident A sees and controls only their own flat ─────────────────
select tests.authenticate_as('user_res_a');

select is(
  (select count(*) from visitor_requests where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1::bigint,
  'resident A can read their own flat''s visitor request');

-- Resident cannot mark a due paid — only claimed (0008)
select throws_ok(
  $$update maintenance_dues set status = 'paid', paid_at = now()
     where id = 'ffffffff-ffff-ffff-ffff-fffffffffff2'$$,
  '42501', null,
  'resident cannot self-mark a due as paid');
reset role;

select tests.authenticate_as('user_res_a');
update maintenance_dues set status = 'claimed', claimed_at = now(), claimed_by = 'user_res_a'
 where id = 'ffffffff-ffff-ffff-ffff-fffffffffff2';
reset role;
select is(
  (select status from maintenance_dues where id = 'ffffffff-ffff-ffff-ffff-fffffffffff2'),
  'claimed',
  'resident can claim a payment (due → claimed)');

-- Poll voting is per flat: A votes, then their (hypothetical) flatmate
-- cannot vote again for the same flat (0010).
select tests.authenticate_as('user_res_a');
insert into poll_votes (poll_id, voter_id, flat_id, option_index)
  values ('ffffffff-ffff-ffff-ffff-fffffffffff3', 'user_res_a', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 0);
reset role;
insert into profiles (id, society_id, role, flat_id, name) values
  ('user_res_a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'resident', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Resident A2');
select tests.authenticate_as('user_res_a2');
select throws_ok(
  $$insert into poll_votes (poll_id, voter_id, flat_id, option_index)
    values ('ffffffff-ffff-ffff-ffff-fffffffffff3', 'user_res_a2', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 1)$$,
  '23505', null,
  'a flat cannot vote twice, even via a second household member');
reset role;

-- Resident cannot vote for another flat
select tests.authenticate_as('user_res_b');
select throws_ok(
  $$insert into poll_votes (poll_id, voter_id, flat_id, option_index)
    values ('ffffffff-ffff-ffff-ffff-fffffffffff3', 'user_res_b', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 0)$$,
  '42501', null,
  'a resident cannot cast a vote for a flat that is not theirs');
reset role;

-- ── Guard powers are narrow ──────────────────────────────────────────
select tests.authenticate_as('user_guard');

select is(
  (select count(*) from visitor_requests where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1::bigint,
  'guard can see pending requests in the society');

-- Guard can never approve (with check status = expired)
select throws_ok(
  $$update visitor_requests
       set status = 'approved', decided_by = 'user_guard', decided_at = now()
     where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  '42501', null,
  'guard cannot approve on a resident''s behalf');
reset role;

-- Guard cannot read/write the rate-limit table directly (0011)
select tests.authenticate_as('user_guard');
select is(
  (select count(*) from gate_code_attempts),
  0::bigint,
  'guard cannot read gate_code_attempts directly');
reset role;

-- ── Resident decides their own flat's request ────────────────────────
select tests.authenticate_as('user_res_a');
update visitor_requests set status = 'approved', decided_by = 'user_res_a', decided_at = now()
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
reset role;
select is(
  (select status from visitor_requests where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'approved',
  'resident A can approve their own flat''s request');

-- Status machine: once decided, no further transitions
select tests.authenticate_as('user_res_a');
update visitor_requests set status = 'denied'
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
reset role;
select is(
  (select status from visitor_requests
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'approved',
  'a decided request cannot be re-decided');

-- ── 0015 security hardening regressions ──────────────────────────────
select tests.authenticate_as('user_res_a');
update profiles
   set role = 'admin',
       society_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
       flat_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc3'
 where id = 'user_res_a';
reset role;
select ok(
  (
    select role = 'resident'
      and society_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and flat_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
    from profiles where id = 'user_res_a'
  ),
  'final 0019 RLS makes direct resident profile mutation a no-op');

select tests.authenticate_as('user_res_a');
select lives_ok(
  $$select update_my_profile(
    null,
    'ExponentPushToken[safe-test]'
  )$$,
  'allowed self-service profile changes use the narrow RPC');
reset role;

-- A client-supplied phone never authorizes invite claiming.
select tests.authenticate_as('user_invitee');
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_invitee',
    'role', 'authenticated',
    'phone_number', '+919800001111',
    'phone_number_verified', true
  )::text,
  true
);
select throws_ok(
  $$select claim_invite('phone', '+919800000999', 'Attacker')$$,
  '42501', null,
  'an invite cannot be claimed using a client phone that differs from the verified claim');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_invitee',
    'role', 'authenticated',
    'phone_number', '+919800000999',
    'phone_number_verified', true
  )::text,
  true
);
select is(
  (
    claim_invite('phone', '+919800000999', 'Verified Invitee')
      ->>'claimed'
  )::boolean,
  true,
  'a matching verified JWT identity can claim the invite');
reset role;

-- Same-role guards cannot write request or entry rows across societies.
select tests.authenticate_as('user_guard');
select throws_ok(
  $$insert into visitor_requests (visitor_id, raised_by)
    values ('dddddddd-dddd-dddd-dddd-ddddddddddde', 'user_guard')$$,
  '42501', null,
  'a guard cannot raise a request for another society');
select throws_ok(
  $$insert into gate_logs (visitor_id, entry_at, entry_guard_id, method)
    values (
      'dddddddd-dddd-dddd-dddd-ddddddddddde',
      now(),
      'user_guard',
      'approved'
    )$$,
  '42501', null,
  'a guard cannot create an entry in another society');
reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.notify_user(text,text,jsonb)',
    'execute'
  ),
  'anon cannot execute internal notification helper');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.notify_user(text,text,jsonb)',
    'execute'
  ),
  'authenticated cannot execute internal notification helper');
select ok(
  not has_function_privilege(
    'anon',
    'public.my_role()',
    'execute'
  ),
  'PUBLIC access is removed from RLS security-definer helpers');

-- Failed redemption returns commit-safe structured data and persists attempts.
select tests.authenticate_as('user_guard');
select redeem_gate_code('000000');
select redeem_gate_code('000001');
select redeem_gate_code('000002');
select redeem_gate_code('000003');
select redeem_gate_code('000004');
select is(
  redeem_gate_code('000005')->>'code',
  'rate_limited',
  'the sixth failed code in ten minutes is rate-limited');
reset role;
select is(
  (
    select count(*)
      from gate_code_attempts
     where guard_id = 'user_guard'
       and success = false
  ),
  5::bigint,
  'failed code attempts persist after structured failures');

-- Administrative FOR ALL policies must repeat role checks in WITH CHECK.
-- These are regression tests for INSERT privilege escalation.
select tests.authenticate_as('user_res_a');
select throws_ok(
  $$insert into profiles (id, society_id, role, name)
    values ('attacker_admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'Escalated')$$,
  '42501', null,
  'a resident cannot create an admin profile');
select throws_ok(
  $$insert into towers (society_id, name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Unauthorized Tower')$$,
  '42501', null,
  'a resident cannot insert a tower');
select throws_ok(
  $$insert into invites (society_id, phone, role, created_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+919811111111', 'admin', 'user_res_a')$$,
  '42501', null,
  'a resident cannot create an admin invite');
select throws_ok(
  $$insert into polls (society_id, question, options, created_by, closes_at)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'Unauthorized poll',
      '["Yes","No"]',
      'user_res_a',
      now() + interval '1 day'
    )$$,
  '42501', null,
  'a resident cannot insert an admin poll');
select throws_ok(
  $$insert into service_providers (society_id, name, category)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Unauthorized', 'Other')$$,
  '42501', null,
  'a resident cannot insert a service provider');
select throws_ok(
  $$insert into gates (society_id, name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Unauthorized Gate')$$,
  '42501', null,
  'a resident cannot insert a gate');
reset role;

select * from finish();
rollback;
