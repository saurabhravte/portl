-- Optional: invoke send-push via pg_net when a notification is created.
-- Requires the pg_net extension and the edge function URL as a setting.
-- Prefer Supabase Dashboard → Database → Webhooks if pg_net is unavailable.
--
-- Setup:
--   alter database postgres set app.settings.send_push_url =
--     'https://YOUR_PROJECT.supabase.co/functions/v1/send-push';
--   alter database postgres set app.settings.service_role_key = 'YOUR_SERVICE_ROLE';

create extension if not exists pg_net with schema extensions;

create or replace function notify_push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  push_url text := current_setting('app.settings.send_push_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
begin
  if push_url is null or push_url = '' then
    return new; -- not configured; Dashboard webhook can still handle this
  end if;

  perform net.http_post(
    url := push_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(service_key, '')
    ),
    body := jsonb_build_object(
      'table', 'notifications',
      'type', 'INSERT',
      'record', row_to_json(new)::jsonb
    )
  );
  return new;
end $$;

drop trigger if exists trg_notification_push on notifications;
create trigger trg_notification_push
  after insert on notifications
  for each row execute function notify_push_on_notification();
