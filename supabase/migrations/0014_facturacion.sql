-- Configuración de facturación electrónica por tenant.
--
-- Datos del emisor (RUC, razón social, dirección, ubigeo) y proveedor de
-- facturación (SUNAT directo u OSE/PSE). Los datos NO secretos van en
-- business_settings; las credenciales secretas (clave SOL, certificado, llave
-- privada, token del OSE) van en fiscal_credentials, que es de solo-escritura
-- desde el cliente (igual que payment_credentials).

alter table business_settings add column if not exists razon_social     text;
alter table business_settings add column if not exists ubigeo           text;
alter table business_settings add column if not exists billing_provider text not null default 'ninguno';
alter table business_settings add column if not exists sunat_mode       text not null default 'beta';
alter table business_settings add column if not exists sol_user         text;
alter table business_settings add column if not exists billing_endpoint text;

-- Credenciales secretas de facturación: se pueden ESCRIBIR pero no LEER desde
-- el cliente. La Edge Function las lee con el service role para firmar y enviar.
create table if not exists fiscal_credentials (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  provider   text not null default 'sunat_directo',
  sol_pass   text,   -- clave SOL (SUNAT directo)
  cert_pem   text,   -- certificado X.509 (PEM)
  key_pem    text,   -- llave privada PKCS#8 (PEM)
  api_token  text,   -- token/API key del OSE/PSE
  updated_at timestamptz not null default now()
);

alter table fiscal_credentials enable row level security;
-- Managers pueden establecer/actualizar (no leer) las credenciales de su tenant.
create policy set_fiscal_ins on fiscal_credentials
  for insert with check (app.can_manage(tenant_id));
create policy set_fiscal_upd on fiscal_credentials
  for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
-- Sin policy de SELECT: el cliente nunca lee las credenciales secretas.
