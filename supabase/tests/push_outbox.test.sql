begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'push_outbox', 'push outbox exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.push_outbox'::regclass),
  'push outbox has RLS'
);
select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.notifications'::regclass
      and not tgisinternal
      and tgname = 'trg_notification_push_outbox'
  ),
  1,
  'notifications have one outbox enqueue trigger'
);
select ok(
  not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.notifications'::regclass
      and not tgisinternal
      and tgname <> 'trg_notification_push_outbox'
  ),
  'notifications have no second push trigger'
);
select has_function(
  'public', 'claim_push_outbox', array['text', 'integer', 'integer'],
  'sender claim RPC exists'
);
select has_function(
  'public', 'claim_push_receipts', array['text', 'integer', 'integer'],
  'receipt claim RPC exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_push_outbox(text,integer,integer)',
    'EXECUTE'
  ),
  'service role can claim sender work'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_push_outbox(text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim sender work'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.unregister_push_token(text)', 'EXECUTE'
  ),
  'authenticated clients can unregister their token'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'push_outbox'
      and indexname = 'push_outbox_claim_idx'
  ),
  'push outbox has a bounded-worker claim index'
);

select * from finish();
rollback;
