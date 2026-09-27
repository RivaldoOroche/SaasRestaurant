-- Personal por sucursal: a qué sucursales puede entrar cada persona.
-- Sin filas = todas las sucursales (así un restaurante de un solo local no
-- tiene que configurar nada). El dueño siempre ve todas.
create table staff_branches (
  staff_id  uuid not null references staff_members (id) on delete cascade,
  branch_id uuid not null,
  tenant_id uuid not null references tenants (id) on delete cascade,
  primary key (staff_id, branch_id),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create index staff_branches_branch_idx on staff_branches (branch_id);
create index staff_branches_tenant_idx on staff_branches (tenant_id);

alter table staff_branches enable row level security;
create policy staff_branches_read on staff_branches for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));
create policy staff_branches_write on staff_branches for all using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))
  with check ((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]));
