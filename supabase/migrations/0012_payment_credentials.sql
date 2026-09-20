-- Credenciales secretas de la pasarela de tarjeta por tenant.
-- Contiene la llave secreta del proveedor, así que se puede ESCRIBIR pero no
-- LEER desde el cliente: RLS con INSERT/UPDATE para managers y sin SELECT. La
-- Edge Function de cobro la lee con el service role.

create table payment_credentials (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  provider    text not null default 'culqi',
  secret_key  text,          -- llave secreta del proveedor (nunca se devuelve al cliente)
  updated_at  timestamptz not null default now()
);

alter table payment_credentials enable row level security;
-- Managers pueden establecer/actualizar (no leer) las credenciales de su tenant.
create policy set_creds_ins on payment_credentials
  for insert with check (app.can_manage(tenant_id));
create policy set_creds_upd on payment_credentials
  for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
-- Sin policy de SELECT: el cliente nunca lee la llave secreta.
