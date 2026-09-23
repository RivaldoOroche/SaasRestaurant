-- Datos del emisor del SaaS (tu empresa) para facturar a los tenants.
-- Tabla de una sola fila, accesible solo por el dueño de la plataforma.
create table if not exists platform_settings (
  id            boolean primary key default true,
  razon_social  text not null default '',
  ruc           text not null default '',
  direccion     text not null default '',
  billing_email text not null default '',
  updated_at    timestamptz not null default now(),
  constraint platform_settings_singleton check (id)
);

insert into platform_settings (id) values (true) on conflict do nothing;

alter table platform_settings enable row level security;
create policy platform_settings_admin on platform_settings
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
