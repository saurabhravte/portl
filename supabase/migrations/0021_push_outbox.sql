-- 0021: Durable, leased Expo push delivery and receipt processing.

-- The old webhook performed network I/O in the notification transaction.
-- Notifications now have exactly one enqueue path: this local trigger.
drop trigger if exists trg_notification_push on notifications;
drop function if exists notify_push_on_notification();

create table push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  recipient_user_id text not null references profiles(id) on delete cascade,
  push_token_id uuid references push_tokens(id) on delete set null,
  expo_push_token text not null,
  payload jsonb not null,
  payload_identity text not null,
  state text not null default 'pending'
    check (state in ('pending', 'leased', 'ticketed', 'succeeded', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  expo_ticket_id text,
  error_class text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (notification_id, recipient_user_id, expo_push_token, payload_identity),
  check (payload->>'to' = expo_push_token),
  check (
    (state = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or state <> 'leased'
  )
);
alter table push_outbox enable row level security;
create index push_outbox_claim_idx
  on push_outbox (next_attempt_at, created_at)
  where state in ('pending', 'leased');
create index push_outbox_notification_idx on push_outbox (notification_id);
create unique index push_outbox_ticket_idx on push_outbox (expo_ticket_id)
  where expo_ticket_id is not null;

alter table push_tickets
  add column if not exists outbox_id uuid references push_outbox(id) on delete cascade,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists error_class text,
  add column if not exists completed_at timestamptz;
alter table push_tickets drop constraint if exists push_tickets_status_check;
alter table push_tickets add constraint push_tickets_status_check
  check (status in ('pending', 'leased', 'ok', 'error', 'dead'));
create unique index if not exists push_tickets_outbox_idx
  on push_tickets(outbox_id) where outbox_id is not null;
drop index if exists push_tickets_pending_idx;
create index push_tickets_claim_idx on push_tickets(next_attempt_at, created_at)
  where status in ('pending', 'leased');

create or replace function enqueue_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  token_row record;
  message jsonb;
  route jsonb;
begin
  route := case
    when new.type = 'visitor_request'
         and not coalesce((new.payload->>'autoApproved')::boolean, false)
      then jsonb_build_object('channelId', 'gate', 'categoryId', 'visitor_request')
    when new.type in ('visitor_request', 'visitor_decision')
      then jsonb_build_object('channelId', 'gate')
    else jsonb_build_object('channelId', 'default')
  end;
  for token_row in
    select id, token from push_tokens where user_id = new.user_id
  loop
    message := jsonb_strip_nulls(jsonb_build_object(
      'to', token_row.token,
      'title', coalesce(new.payload->>'title', 'Portl'),
      'body', coalesce(new.payload->>'body', 'You have a new update.'),
      'sound', 'default',
      'priority', 'high',
      'channelId', route->>'channelId',
      'categoryId', route->>'categoryId',
      'data', jsonb_strip_nulls(jsonb_build_object(
        'url', new.payload->'url',
        'type', new.type,
        'requestId', new.payload->'requestId',
        'notificationId', new.id
      ))
    ));
    insert into push_outbox(
      notification_id, recipient_user_id, push_token_id, expo_push_token,
      payload, payload_identity
    ) values (
      new.id, new.user_id, token_row.id, token_row.token, message,
      md5(message::text)
    ) on conflict do nothing;
  end loop;
  return new;
end $$;
revoke all on function enqueue_notification_push() from public;
create trigger trg_notification_push_outbox
  after insert on notifications
  for each row execute function enqueue_notification_push();

create or replace function claim_push_outbox(
  p_worker text, p_limit integer default 100, p_lease_seconds integer default 120
) returns setof push_outbox
language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(p_worker), '') is null then
    raise exception 'worker is required' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select id from push_outbox
    where (
      state = 'pending' and next_attempt_at <= now()
      or state = 'leased' and lease_expires_at <= now()
    )
    order by next_attempt_at, created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 100)
  )
  update push_outbox o
     set state = 'leased',
         attempts = attempts + 1,
         lease_owner = p_worker,
         lease_expires_at = now() + make_interval(
           secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 600)
         ),
         updated_at = now()
    from candidates c
   where o.id = c.id
  returning o.*;
end $$;

create or replace function complete_push_outbox(
  p_outbox_id uuid, p_worker text, p_ticket_id text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare claimed push_outbox;
begin
  update push_outbox
     set state = 'ticketed', expo_ticket_id = p_ticket_id,
         lease_owner = null, lease_expires_at = null, error_class = null,
         error_code = null, error_message = null, updated_at = now()
   where id = p_outbox_id and state = 'leased' and lease_owner = p_worker
     and lease_expires_at > now() and nullif(trim(p_ticket_id), '') is not null
  returning * into claimed;
  if not found then return false; end if;
  insert into push_tickets(
    ticket_id, outbox_id, expo_push_token, status, attempts, next_attempt_at
  ) values (
    p_ticket_id, claimed.id, claimed.expo_push_token, 'pending', 0,
    now() + interval '15 minutes'
  );
  return true;
end $$;

create or replace function retry_push_outbox(
  p_outbox_id uuid, p_worker text, p_error_class text, p_error_code text,
  p_error_message text, p_next_attempt_at timestamptz, p_dead boolean default false
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update push_outbox
     set state = case when p_dead or attempts >= 10 then 'dead' else 'pending' end,
         next_attempt_at = greatest(coalesce(p_next_attempt_at, now()), now()),
         lease_owner = null, lease_expires_at = null,
         error_class = left(coalesce(p_error_class, 'unknown'), 64),
         error_code = left(coalesce(p_error_code, 'unknown'), 128),
         error_message = left(coalesce(p_error_message, 'push failed'), 500),
         completed_at = case when p_dead or attempts >= 10 then now() else null end,
         updated_at = now()
   where id = p_outbox_id and state = 'leased' and lease_owner = p_worker
     and lease_expires_at > now();
  return found;
end $$;

create or replace function claim_push_receipts(
  p_worker text, p_limit integer default 1000, p_lease_seconds integer default 120
) returns setof push_tickets
language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(p_worker), '') is null then
    raise exception 'worker is required' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select ticket_id from push_tickets
    where (
      status = 'pending' and next_attempt_at <= now()
      or status = 'leased' and lease_expires_at <= now()
    )
    order by next_attempt_at, created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 1000)
  )
  update push_tickets t
     set status = 'leased', attempts = attempts + 1, lease_owner = p_worker,
         lease_expires_at = now() + make_interval(
           secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 600)
         ), updated_at = now()
    from candidates c where t.ticket_id = c.ticket_id
  returning t.*;
end $$;

create or replace function complete_push_receipt(
  p_ticket_id text, p_worker text, p_status text,
  p_error_class text default null, p_error_code text default null,
  p_error_message text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare linked_outbox uuid;
begin
  if p_status not in ('ok', 'error', 'dead') then
    raise exception 'invalid receipt status' using errcode = '22023';
  end if;
  update push_tickets
     set status = p_status, receipt_error = left(p_error_message, 500),
         error_class = left(p_error_class, 64), lease_owner = null,
         lease_expires_at = null, completed_at = now(), updated_at = now()
   where ticket_id = p_ticket_id and status = 'leased'
     and lease_owner = p_worker and lease_expires_at > now()
  returning outbox_id into linked_outbox;
  if not found then return false; end if;
  update push_outbox set
    state = case when p_status = 'ok' then 'succeeded' else 'dead' end,
    error_class = left(p_error_class, 64),
    error_code = left(p_error_code, 128),
    error_message = left(p_error_message, 500),
    completed_at = now(), updated_at = now()
  where id = linked_outbox and state = 'ticketed';
  return true;
end $$;

create or replace function retry_push_receipt(
  p_ticket_id text, p_worker text, p_error_class text, p_error_message text,
  p_next_attempt_at timestamptz, p_dead boolean default false
) returns boolean
language plpgsql security definer set search_path = public as $$
declare linked_outbox uuid;
begin
  update push_tickets
     set status = case when p_dead or attempts >= 8 then 'dead' else 'pending' end,
         next_attempt_at = greatest(coalesce(p_next_attempt_at, now()), now()),
         receipt_error = left(p_error_message, 500),
         error_class = left(p_error_class, 64),
         lease_owner = null, lease_expires_at = null,
         completed_at = case when p_dead or attempts >= 8 then now() else null end,
         updated_at = now()
   where ticket_id = p_ticket_id and status = 'leased'
     and lease_owner = p_worker and lease_expires_at > now()
  returning outbox_id into linked_outbox;
  if not found then return false; end if;
  if p_dead or (select attempts >= 8 from push_tickets where ticket_id = p_ticket_id) then
    update push_outbox set
      state = 'dead', error_class = left(p_error_class, 64),
      error_code = 'receipt_retries_exhausted',
      error_message = left(p_error_message, 500),
      completed_at = now(), updated_at = now()
    where id = linked_outbox and state = 'ticketed';
  end if;
  return true;
end $$;

create or replace function invalidate_push_token(
  p_outbox_id uuid, p_expected_token text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from push_tokens t
   using push_outbox o
   where o.id = p_outbox_id
     and t.id = o.push_token_id
     and t.token = p_expected_token
     and o.expo_push_token = p_expected_token;
  return found;
end $$;

create or replace function unregister_push_token(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if clerk_uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from push_tokens where user_id = clerk_uid() and token = p_token;
  return found;
end $$;

revoke all on function claim_push_outbox(text, integer, integer) from public;
revoke all on function complete_push_outbox(uuid, text, text) from public;
revoke all on function retry_push_outbox(uuid, text, text, text, text, timestamptz, boolean) from public;
revoke all on function claim_push_receipts(text, integer, integer) from public;
revoke all on function complete_push_receipt(text, text, text, text, text, text) from public;
revoke all on function retry_push_receipt(text, text, text, text, timestamptz, boolean) from public;
revoke all on function invalidate_push_token(uuid, text) from public;
grant execute on function claim_push_outbox(text, integer, integer) to service_role;
grant execute on function complete_push_outbox(uuid, text, text) to service_role;
grant execute on function retry_push_outbox(uuid, text, text, text, text, timestamptz, boolean) to service_role;
grant execute on function claim_push_receipts(text, integer, integer) to service_role;
grant execute on function complete_push_receipt(text, text, text, text, text, text) to service_role;
grant execute on function retry_push_receipt(text, text, text, text, timestamptz, boolean) to service_role;
grant execute on function invalidate_push_token(uuid, text) to service_role;
revoke all on function unregister_push_token(text) from public;
grant execute on function unregister_push_token(text) to authenticated;

-- Versioned schedules are installed only on hosts where both extensions and
-- all settings already exist. Local reset therefore never requires either.

do $$
declare
  send_url text := current_setting('app.settings.send_push_url', true);
  receipt_url text := current_setting('app.settings.push_receipts_url', true);
  secret text := current_setting('app.settings.send_push_secret', true);
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and coalesce(send_url, '') <> ''
     and coalesce(receipt_url, '') <> ''
     and coalesce(secret, '') <> '' then
    perform cron.schedule(
      'portl-send-push-v0021', '* * * * *',
      format(
        $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret',%L), body := '{}'::jsonb);$job$,
        send_url, secret
      )
    );
    perform cron.schedule(
      'portl-push-receipts-v0021', '*/15 * * * *',
      format(
        $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret',%L), body := '{}'::jsonb);$job$,
        receipt_url, secret
      )
    );
  end if;
end $$;
