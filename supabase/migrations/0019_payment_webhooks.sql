-- Pasarelas de pago: credenciales extra (Izipay/Niubiz) y webhooks idempotentes.

-- Campos adicionales de credenciales para proveedores más allá de Culqi.
alter table payment_credentials add column if not exists public_key     text;  -- llave pública (Izipay/Niubiz)
alter table payment_credentials add column if not exists merchant_id    text;  -- código de comercio (Niubiz)
alter table payment_credentials add column if not exists webhook_secret text;  -- para verificar la firma de los webhooks
alter table payment_credentials add column if not exists extra          jsonb not null default '{}'::jsonb;

-- Registro idempotente de eventos de pasarela (webhooks). La Edge Function los
-- inserta con el service role; el unique (provider, event_id) garantiza que un
-- mismo evento no se procese dos veces aunque la pasarela lo reintente.
create table if not exists payment_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  provider    text not null,
  event_id    text not null,
  event_type  text,
  charge_id   text,
  amount      numeric(12,2),
  status      text,
  raw         jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
create index if not exists payment_events_tenant_idx on payment_events (tenant_id);

alter table payment_events enable row level security;
-- Lectura: el tenant ve sus eventos; la plataforma ve todos. La escritura es
-- exclusiva de la Edge Function (service role), que evita el RLS.
create policy payment_events_read on payment_events
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());
