-- Permisos por rol configurables por el tenant (más allá de los roles fijos).
-- Cada fila define, para un rol, la lista de pantallas del POS a las que puede
-- acceder. Si no hay fila para un rol, se usan los permisos por defecto del rol.

create table if not exists role_permissions (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  role       app_role not null,
  screens    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, role)
);

alter table role_permissions enable row level security;
-- Todos los miembros del tenant leen (para saber qué mostrar); solo dueño/admin escriben.
create policy role_perms_read on role_permissions
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());
create policy role_perms_write on role_permissions
  for all using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
