-- Notificaciones push (Web Push / VAPID). Guarda la suscripción del navegador
-- de cada usuario para enviarle notificaciones (comanda lista, cobro aprobado,
-- alertas de SUNAT, etc.). El envío lo hace la Edge Function push-enviar con
-- las claves VAPID (secretas, solo en el servidor).

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references tenants(id) on delete cascade, -- null para usuarios de plataforma
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);
create index if not exists push_sub_tenant_idx on push_subscriptions (tenant_id);
create index if not exists push_sub_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
-- Cada usuario administra sus propias suscripciones; la plataforma puede leer
-- (para diagnóstico). El envío real usa la service role y omite RLS.
create policy push_sub_own_ins on push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy push_sub_own_del on push_subscriptions
  for delete using (auth.uid() = user_id);
create policy push_sub_read on push_subscriptions
  for select using (auth.uid() = user_id or app.is_platform_admin());
