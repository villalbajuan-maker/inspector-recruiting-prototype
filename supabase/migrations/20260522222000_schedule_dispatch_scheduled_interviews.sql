create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'dispatch-scheduled-interviews-every-minute'
  ) then
    perform cron.unschedule('dispatch-scheduled-interviews-every-minute');
  end if;
end $$;

select cron.schedule(
  'dispatch-scheduled-interviews-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://qiyczncddtiypngpiswz.supabase.co/functions/v1/dispatch-scheduled-interviews',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWN6bmNkZHRpeXBuZ3Bpc3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY4OTIsImV4cCI6MjA4NDUwMjg5Mn0.-kVHKkCeA3E59pf2Cn0UdRowJ1EihxBZ0OVu8ODMn20',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWN6bmNkZHRpeXBuZ3Bpc3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY4OTIsImV4cCI6MjA4NDUwMjg5Mn0.-kVHKkCeA3E59pf2Cn0UdRowJ1EihxBZ0OVu8ODMn20'
    ),
    body := '{"limit": 10}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
