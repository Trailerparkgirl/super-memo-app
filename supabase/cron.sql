-- 毎日の復習リマインダーを送る関数（supabase/functions/daily-reminder）を、毎時0分に呼ぶ。
-- schema.sql とは別に、最初に一度だけ SQL Editor で実行する（何度実行しても大丈夫）。
-- 実行する前に <project-ref> と <cron-secret> を自分の値に置き換える。
--   <project-ref>: Project URL の https://<project-ref>.supabase.co の部分
--   <cron-secret>: supabase secrets set CRON_SECRET=... で設定したのと同じ値

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('daily-reminder') where exists (select 1 from cron.job where jobname = 'daily-reminder');

select cron.schedule(
  'daily-reminder',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/daily-reminder',
    headers := jsonb_build_object('Authorization', 'Bearer <cron-secret>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
