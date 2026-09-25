-- Mensajes de contacto de la landing (solicitudes de demo / leads).
-- La Edge Function `contacto` los inserta con el service role; solo la
-- plataforma los lee. No hay policy de insert para el cliente.

create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  negocio    text,
  email      text not null,
  telefono   text,
  mensaje    text,
  origen     text not null default 'landing',
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on contact_messages (created_at desc);

alter table contact_messages enable row level security;
create policy contact_read_admin on contact_messages
  for select using (app.is_platform_admin());
create policy contact_update_admin on contact_messages
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
