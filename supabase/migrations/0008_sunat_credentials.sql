-- Credenciales de facturación electrónica por tenant (para producción multi-tenant).
-- Contiene secretos (clave SOL, certificado, llave privada), así que la tabla queda
-- CON RLS habilitada y SIN políticas: ningún cliente puede leerla. Solo la Edge
-- Function `sunat-emitir` la lee con el service role (que evade RLS).
--
-- Para la homologación beta puedes omitir esta tabla y usar los secrets del
-- proyecto (SUNAT_RUC=20000000001, SUNAT_SOL_USER=MODDATOS, etc.); ver README.

create type sunat_mode as enum ('beta', 'produccion');

create table sunat_credentials (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  mode        sunat_mode not null default 'beta',
  endpoint    text not null default 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  ruc         text not null,
  sol_user    text not null default 'MODDATOS',
  sol_pass    text not null default 'MODDATOS',
  cert_pem    text,   -- certificado X.509 (PEM)
  key_pem     text,   -- llave privada PKCS#8 (PEM)
  serie_factura text not null default 'F001',
  serie_boleta  text not null default 'B001',
  updated_at  timestamptz not null default now()
);

alter table sunat_credentials enable row level security;
-- Sin políticas: acceso denegado a clientes; solo service role (Edge Function).
