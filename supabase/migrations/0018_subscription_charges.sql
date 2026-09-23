-- Cobros de suscripción con aprobación previa (dunning con validación).
--
-- El cobro automático NO ejecuta el cargo directamente: primero genera una
-- PROPUESTA de cobro con los datos que irán en la factura (RUC, razón social,
-- plan, base, IGV, total, periodo). El dueño del SaaS revisa/valida esos datos
-- y recién al APROBAR se ejecuta el cargo (pasarela) y se emite la factura.

do $$ begin
  create type charge_status as enum ('pendiente', 'aprobada', 'rechazada', 'cobrada', 'fallida');
exception when duplicate_object then null; end $$;

create table if not exists subscription_charges (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  plan         plan_tier not null,
  base         numeric(10,2) not null default 0,
  igv          numeric(10,2) not null default 0,
  total        numeric(10,2) not null,
  -- Foto de los datos a facturar en el momento de proponer el cobro:
  ruc          text,
  razon_social text,
  period       text not null,          -- p.ej. "2026-09"
  status       charge_status not null default 'pendiente',
  note         text,
  invoice_id   uuid references saas_invoices(id) on delete set null,
  proposed_at  timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null
);
create index if not exists subscription_charges_status_idx on subscription_charges (status);
-- Una sola propuesta pendiente por tenant y periodo (idempotencia del dunning).
create unique index if not exists subscription_charges_open_unique
  on subscription_charges (tenant_id, period)
  where status in ('pendiente', 'aprobada');

alter table subscription_charges enable row level security;
create policy subcharges_admin on subscription_charges
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
