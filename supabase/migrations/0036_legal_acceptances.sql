-- Aceptación de documentos legales (Términos, Privacidad, Encargo de
-- tratamiento) con su versión: prueba de la manifestación de voluntad del
-- cliente (Código Civil arts. 141 y 1374) y base para pedir re-aceptación
-- cuando un documento cambia.
create table legal_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tenant_id   uuid references tenants (id) on delete cascade,
  document    text not null check (document in ('terminos', 'privacidad', 'encargo', 'marketing')),
  version     text not null,
  user_agent  text,
  accepted_at timestamptz not null default now(),
  unique (user_id, tenant_id, document, version)
);
create index legal_acceptances_tenant_idx on legal_acceptances (tenant_id);

alter table legal_acceptances enable row level security;
-- Cada usuario registra su propia aceptación (no se edita ni se borra: es evidencia).
create policy legal_acc_insert on legal_acceptances for insert
  with check (user_id = (select auth.uid()));
create policy legal_acc_read on legal_acceptances for select
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));
