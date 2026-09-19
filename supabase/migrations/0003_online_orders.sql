-- Online / delivery orders (Rappi, PedidosYa, WhatsApp, Web). Added in Phase 2.
create table online_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  channel       text not null,
  customer_name text not null default '',
  items         text not null default '',
  total         numeric(12,2) not null default 0,
  eta           text not null default '',
  status        text not null default 'nuevo',
  created_at    timestamptz not null default now()
);
create index on online_orders (tenant_id);

alter table online_orders enable row level security;
create policy tenant_rw on online_orders
  for all
  using (app.has_tenant(tenant_id))
  with check (app.has_tenant(tenant_id));
