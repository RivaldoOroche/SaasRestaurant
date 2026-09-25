-- Autoservicio de suscripción: el dueño del restaurante solicita un cambio de
-- plan y la plataforma lo aprueba (consistente con el modelo de aprobación).

do $$ begin
  create type plan_req_status as enum ('pendiente','aprobada','rechazada');
exception when duplicate_object then null; end $$;

create table if not exists plan_change_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  from_plan    plan_tier not null,
  to_plan      plan_tier not null,
  status       plan_req_status not null default 'pendiente',
  note         text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists plan_req_tenant_idx on plan_change_requests (tenant_id, status);
-- Una sola solicitud pendiente por tenant.
create unique index if not exists plan_req_open_unique on plan_change_requests (tenant_id) where status = 'pendiente';

alter table plan_change_requests enable row level security;
create policy planreq_tenant_ins on plan_change_requests
  for insert with check (app.can_manage(tenant_id));
create policy planreq_read on plan_change_requests
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());
create policy planreq_admin_upd on plan_change_requests
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
