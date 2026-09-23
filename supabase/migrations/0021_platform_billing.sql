-- Proveedor de facturación del SaaS (para las facturas de suscripción que la
-- plataforma emite a los tenants): SUNAT directo u OSE/PSE (Nubefact, etc.).

alter table platform_settings add column if not exists billing_provider text not null default 'sunat_directo';
alter table platform_settings add column if not exists sunat_mode       text not null default 'beta';
alter table platform_settings add column if not exists sol_user         text;
alter table platform_settings add column if not exists billing_endpoint text;

-- Credenciales secretas del emisor de la plataforma (write-only, como las del
-- tenant): clave SOL, certificado, llave privada, token del OSE. Fila única.
create table if not exists platform_fiscal_credentials (
  id         boolean primary key default true,
  provider   text not null default 'sunat_directo',
  sol_pass   text,
  cert_pem   text,
  key_pem    text,
  api_token  text,
  updated_at timestamptz not null default now(),
  constraint platform_fiscal_singleton check (id)
);
insert into platform_fiscal_credentials (id) values (true) on conflict do nothing;

alter table platform_fiscal_credentials enable row level security;
-- El dueño de la plataforma puede escribir/actualizar; nadie las LEE desde el
-- cliente (sin policy de SELECT). La Edge Function las lee con el service role.
create policy platform_fiscal_ins on platform_fiscal_credentials
  for insert with check (app.is_platform_admin());
create policy platform_fiscal_upd on platform_fiscal_credentials
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
