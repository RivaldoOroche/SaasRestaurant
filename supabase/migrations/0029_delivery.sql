-- Delivery: zonas de reparto, repartidores propios y pedidos a domicilio
-- (canales propios —teléfono, WhatsApp, web— y agregadores —Rappi, PedidosYa—).
-- El cliente sigue su pedido con un enlace público basado en un token secreto.

do $$ begin
  create type delivery_status as enum ('recibido','preparando','listo','en_camino','entregado','cancelado');
exception when duplicate_object then null; end $$;

-- Código visible para el cliente (D-1001, D-1002, …).
create sequence if not exists delivery_code_seq start 1001;

create table if not exists delivery_zones (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name      text not null,
  fee       numeric(10,2) not null default 0 check (fee >= 0),
  eta_min   int not null default 40 check (eta_min > 0),
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists delivery_zones_tenant_idx on delivery_zones (tenant_id);

create table if not exists delivery_drivers (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name      text not null,
  phone     text not null default '',
  vehicle   text not null default 'moto' check (vehicle in ('moto','bici','auto')),
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists delivery_drivers_tenant_idx on delivery_drivers (tenant_id);

create table if not exists delivery_orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  branch_id      uuid references branches(id) on delete set null,
  code           text not null default ('D-' || nextval('delivery_code_seq')),
  -- 24 hex = 96 bits aleatorios: el enlace público no se puede adivinar.
  tracking_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  channel        text not null check (channel in ('telefono','whatsapp','web','rappi','pedidosya')),
  customer_name  text not null,
  customer_phone text not null default '',
  address        text not null default '',
  reference      text not null default '',
  zone_id        uuid references delivery_zones(id) on delete set null,
  zone_name      text not null default '',
  items          jsonb not null default '[]'::jsonb, -- [{name, qty, price}]
  subtotal       numeric(12,2) not null default 0,
  fee            numeric(10,2) not null default 0,
  total          numeric(12,2) not null default 0,
  pay_method     text not null check (pay_method in ('efectivo','yape','plin','tarjeta','pagado_app')),
  cash_for       numeric(12,2),
  status         delivery_status not null default 'recibido',
  driver_id      uuid references delivery_drivers(id) on delete set null,
  notes          text not null default '',
  cancel_reason  text,
  eta_min        int not null default 40,
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  ready_at       timestamptz,
  dispatched_at  timestamptz,
  delivered_at   timestamptz,
  cancelled_at   timestamptz
);
create index if not exists delivery_orders_tenant_idx on delivery_orders (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Zonas y repartidores: todo el equipo los ve; solo gerente/dueño los gestiona.
alter table delivery_zones enable row level security;
create policy dz_read on delivery_zones for select using (app.has_tenant(tenant_id));
create policy dz_ins on delivery_zones for insert with check (app.can_manage(tenant_id));
create policy dz_upd on delivery_zones for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
create policy dz_del on delivery_zones for delete using (app.can_manage(tenant_id));

alter table delivery_drivers enable row level security;
create policy dd_read on delivery_drivers for select using (app.has_tenant(tenant_id));
create policy dd_ins on delivery_drivers for insert with check (app.can_manage(tenant_id));
create policy dd_upd on delivery_drivers for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
create policy dd_del on delivery_drivers for delete using (app.can_manage(tenant_id));

-- Pedidos: cualquier miembro del tenant los toma y avanza (meseros/cajeros
-- reciben pedidos por teléfono). No se borran: se cancelan con motivo.
alter table delivery_orders enable row level security;
create policy do_read on delivery_orders for select using (app.has_tenant(tenant_id));
create policy do_ins on delivery_orders for insert with check (app.has_tenant(tenant_id));
create policy do_upd on delivery_orders for update using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Seguimiento público (sin sesión). Devuelve solo lo necesario para el cliente:
-- NUNCA dirección, teléfono, montos ni el nombre completo del repartidor.
-- ---------------------------------------------------------------------------
create or replace function public.public_delivery_status(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant_name',   t.name,
    'code',          d.code,
    'status',        d.status,
    'eta_min',       d.eta_min,
    'driver_name',   case when d.status in ('en_camino','entregado')
                          then split_part(dr.name, ' ', 1) end,
    'created_at',    d.created_at,
    'accepted_at',   d.accepted_at,
    'ready_at',      d.ready_at,
    'dispatched_at', d.dispatched_at,
    'delivered_at',  d.delivered_at,
    'cancelled_at',  d.cancelled_at
  )
  from delivery_orders d
  join tenants t on t.id = d.tenant_id
  left join delivery_drivers dr on dr.id = d.driver_id
  where length(p_token) >= 16 and d.tracking_token = p_token;
$$;

grant execute on function public.public_delivery_status(text) to anon, authenticated;
