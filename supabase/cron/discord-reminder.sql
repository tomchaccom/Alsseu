-- Supabase SQL Editor에서 project URL과 secret을 실제 값으로 교체한 뒤 한 번 실행합니다.
-- pg_cron은 UTC 기준이므로 일요일 12:00 UTC = 일요일 21:00 KST입니다.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'project_url'
);

select vault.create_secret(
  'YOUR_REMINDER_CRON_SECRET',
  'reminder_cron_secret'
);

-- 일요일 12:00 UTC = 일요일 21:00 KST: 마감 3시간 전 알림
select cron.schedule(
  'algo-study-discord-reminder-3h',
  '0 12 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/discord-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'reminder_cron_secret'
      )
    ),
    body := '{"kind":"deadline_3h"}'::jsonb
  );
  $$
);

-- 일요일 15:00 UTC = 월요일 00:00 KST: 주차 마감 후 벌금 대상 공지
select cron.schedule(
  'algo-study-discord-penalty-announcement',
  '0 15 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/discord-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'reminder_cron_secret'
      )
    ),
    body := '{"kind":"penalty_announcement"}'::jsonb
  );
  $$
);
