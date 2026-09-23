-- OPCIONAL — Programar cron-tareas desde la base con pg_cron + pg_net.
-- (Alternativa a la GitHub Action .github/workflows/cron.yml. Usa una u otra.)
--
-- NO forma parte de setup_all.sql: requiere valores propios de tu proyecto y
-- las extensiones pg_cron/pg_net (disponibles en Supabase). Reemplaza:
--   <PROJECT_REF>  -> el ref de tu proyecto (subdominio del dashboard)
--   <CRON_SECRET>  -> el mismo valor del secret CRON_SECRET de la función
--   <ANON_KEY>     -> tu anon key (para pasar el gateway de funciones)
--
-- Pégalo en el SQL Editor una vez.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Corre todos los días a las 13:00 UTC (08:00 Lima). Ajusta el horario.
select cron.schedule(
  'wayra-cron-tareas',
  '0 13 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/cron-tareas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver o quitar el job:
--   select * from cron.job;
--   select cron.unschedule('wayra-cron-tareas');
