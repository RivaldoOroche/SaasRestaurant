-- Sucursal en las comandas de cocina, para filtrar el KDS por sucursal activa.
alter table kitchen_tickets add column if not exists branch_id uuid references branches(id) on delete set null;
create index if not exists kitchen_tickets_branch on kitchen_tickets (branch_id);
