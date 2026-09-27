-- =============================================================================
-- 0031 · Arquitectura multi-sucursal, normalización y rendimiento
--
--  1. Sucursales como árbol: cada restaurante (tenant) tiene UNA sede principal
--     (raíz, parent_id null) y sucursales hijas. Se crea sola al dar de alta el
--     tenant. Integridad: sin ciclos, raíz única, hijos del mismo tenant.
--  2. Cuota por plan: subscription_plans.max_branches = sucursales además de la
--     principal (Básico 2 · Pro 10 · Enterprise sin límite). Se valida al crear
--     o reactivar sucursales y al bajar de plan.
--  3. branch_id obligatorio en la operación (por defecto, la sede principal) y
--     FK compuesta (tenant_id, branch_id): una fila nunca apunta a la sucursal
--     de otro restaurante.
--  4. Delivery unificado con pedidos: delivery_orders pasa a ser la extensión
--     1:1 de orders (misma id). Sus platos viven en order_lines, así el delivery
--     entra en reportes, caja, inventario y comprobantes como cualquier venta.
--  5. Inventario por sucursal: catálogo (inventory_items) + stock por sucursal
--     (inventory_stock) + kardex (inventory_movements). El stock es la suma
--     de movimientos, mantenida por trigger.
--  6. Limpieza: online_orders / sunat_credentials / payroll_entries (sin uso),
--     tenants.mrr (derivado del plan: vista v_tenants).
--  7. updated_at en tablas operativas (sincronización incremental offline).
--  8. Índices para las consultas reales y RLS con InitPlan (los helpers se
--     evalúan una vez por consulta, no una vez por fila).
--  9. Publicación de Realtime con las tablas operativas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers genéricos
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Tenants del usuario actual en un arreglo: permite escribir las políticas como
-- `tenant_id = any((select app.my_tenant_ids()))`, que Postgres evalúa una sola
-- vez por consulta (InitPlan) en lugar de llamar a una función por cada fila.
create or replace function app.my_tenant_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from memberships m
  where m.user_id = auth.uid() and m.tenant_id is not null;
$$;

create or replace function app.my_managed_tenant_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from memberships m
  where m.user_id = auth.uid() and m.tenant_id is not null and m.role in ('admin', 'dueno');
$$;

-- ---------------------------------------------------------------------------
-- 1. Árbol de sucursales
-- ---------------------------------------------------------------------------
alter table branches
  add column if not exists parent_id  uuid,
  add column if not exists active     boolean not null default true,
  add column if not exists address    text not null default '',
  add column if not exists phone      text not null default '',
  add column if not exists sort       int  not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table branches add constraint branches_tenant_id_id_key unique (tenant_id, id);
alter table branches add constraint branches_not_self check (parent_id is null or parent_id <> id);
-- NO ACTION (no RESTRICT): al borrar un tenant, la cascada elimina todo el árbol
-- en la misma sentencia y la FK se valida al final.
alter table branches add constraint branches_parent_fk
  foreign key (tenant_id, parent_id) references branches (tenant_id, id);

-- Tenants sin sucursales: se les crea su sede principal.
insert into branches (tenant_id, name, city)
select t.id, t.name, ''
from tenants t
where not exists (select 1 from branches b where b.tenant_id = t.id);

-- Tenants con sucursales: la más antigua es la principal; el resto, sus hijas.
with roots as (
  select distinct on (tenant_id) tenant_id, id
  from branches
  order by tenant_id, created_at, name
)
update branches b set parent_id = r.id
from roots r
where b.tenant_id = r.tenant_id and b.id <> r.id and b.parent_id is null;

create unique index branches_one_root on branches (tenant_id) where parent_id is null;
create index branches_parent_idx on branches (parent_id);

create or replace function app.root_branch(tid uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select id from branches where tenant_id = tid and parent_id is null;
$$;

-- Integridad del árbol: la principal no cuelga de nadie; sin ciclos; hasta 5 niveles.
create or replace function app.branches_tree_guard() returns trigger
language plpgsql as $$
declare
  cur   uuid := new.parent_id;
  depth int  := 0;
begin
  if tg_op = 'UPDATE' and old.parent_id is null and new.parent_id is not null then
    raise exception 'La sede principal no puede depender de otra sucursal.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.parent_id is not null and new.parent_id is null then
    raise exception 'Ya existe una sede principal; una sucursal no puede convertirse en principal.' using errcode = 'P0001';
  end if;
  while cur is not null loop
    if cur = new.id then
      raise exception 'Una sucursal no puede depender de sí misma ni de sus propias sucursales.' using errcode = 'P0001';
    end if;
    depth := depth + 1;
    if depth > 5 then
      raise exception 'El árbol de sucursales admite hasta 5 niveles.' using errcode = 'P0001';
    end if;
    select parent_id into cur from branches where id = cur;
  end loop;
  return new;
end $$;

create trigger branches_tree_guard
  before insert or update of parent_id on branches
  for each row execute function app.branches_tree_guard();

-- Borrado directo (no en cascada desde el tenant): nunca la principal, nunca
-- una sucursal con hijas o con historial. Para dejar de usarla: desactivarla.
create or replace function app.branches_delete_guard() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return old; -- cascada al eliminar el tenant completo
  end if;
  if old.parent_id is null then
    raise exception 'La sede principal no se puede eliminar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from branches where parent_id = old.id) then
    raise exception 'La sucursal tiene sucursales dependientes; muévelas primero.' using errcode = 'P0001';
  end if;
  if exists (select 1 from orders where branch_id = old.id)
     or exists (select 1 from restaurant_tables where branch_id = old.id) then
    raise exception 'La sucursal tiene mesas o ventas registradas; desactívala en lugar de eliminarla.' using errcode = 'P0001';
  end if;
  return old;
end $$;

create trigger branches_delete_guard
  before delete on branches
  for each row execute function app.branches_delete_guard();

create trigger branches_touch before update on branches
  for each row execute function app.touch_updated_at();

-- Alta de tenant → su sede principal (mismo nombre; se puede renombrar).
create or replace function app.tenants_create_root() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  insert into branches (tenant_id, name, city) values (new.id, new.name, '');
  return new;
end $$;

create trigger tenants_create_root
  after insert on tenants
  for each row execute function app.tenants_create_root();

-- ---------------------------------------------------------------------------
-- 2. Cuota de sucursales por plan
-- ---------------------------------------------------------------------------
alter table subscription_plans
  add column if not exists max_branches int check (max_branches is null or max_branches >= 0);
comment on column subscription_plans.max_branches is
  'Sucursales permitidas además de la sede principal. NULL = sin límite.';

update subscription_plans set max_branches = case tier
  when 'Básico' then 2
  when 'Pro' then 10
  else null
end;

create or replace function app.plan_max_branches(p_plan plan_tier) returns int
language sql stable security definer set search_path = public, app as $$
  select max_branches from subscription_plans where tier = p_plan;
$$;

create or replace function app.active_child_branches(tid uuid, except_id uuid default null) returns int
language sql stable security definer set search_path = public, app as $$
  select count(*)::int from branches
  where tenant_id = tid and parent_id is not null and active
    and (except_id is null or id <> except_id);
$$;

create or replace function app.branches_quota_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_plan plan_tier;
  v_max  int;
begin
  -- Solo cuenta al sumar una sucursal activa (alta o reactivación).
  if new.parent_id is null or not new.active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and old.parent_id is not null then
    return new;
  end if;
  -- Serializa altas concurrentes del mismo tenant.
  select plan into v_plan from tenants where id = new.tenant_id for update;
  v_max := app.plan_max_branches(v_plan);
  if v_max is not null and app.active_child_branches(new.tenant_id, new.id) >= v_max then
    raise exception 'Tu plan % permite la sede principal y hasta % sucursales. Mejora tu plan para agregar más.', v_plan, v_max
      using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;

create trigger branches_quota_guard
  before insert or update of active, parent_id on branches
  for each row execute function app.branches_quota_guard();

-- Bajar de plan no puede dejar más sucursales activas que las permitidas.
create or replace function app.tenants_plan_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_max  int := app.plan_max_branches(new.plan);
  v_used int;
begin
  if new.plan is distinct from old.plan and v_max is not null then
    v_used := app.active_child_branches(new.id);
    if v_used > v_max then
      raise exception 'El plan % permite hasta % sucursales y el restaurante tiene % activas. Desactiva % antes de cambiar de plan.',
        new.plan, v_max, v_used, v_used - v_max
        using errcode = 'P0001', hint = 'plan_limit';
    end if;
  end if;
  return new;
end $$;

create trigger tenants_plan_guard
  before update of plan on tenants
  for each row execute function app.tenants_plan_guard();

-- Uso de la cuota para la UI (Sucursales / Suscripción).
create or replace function public.branch_quota(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_plan plan_tier;
  v_max  int;
  v_used int;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  select plan into v_plan from tenants where id = p_tenant;
  v_max := app.plan_max_branches(v_plan);
  v_used := app.active_child_branches(p_tenant);
  return jsonb_build_object(
    'plan', v_plan,
    'max', v_max,
    'used', v_used,
    'remaining', case when v_max is null then null else greatest(v_max - v_used, 0) end
  );
end $$;
grant execute on function public.branch_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. branch_id obligatorio + FK compuesta (tenant_id, branch_id)
-- ---------------------------------------------------------------------------
create or replace function app.fill_branch() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.branch_id is null then
    new.branch_id := app.root_branch(new.tenant_id);
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'restaurant_tables', 'kitchen_tickets', 'reservations',
                           'waitlist', 'cash_register_closes']
  loop
    execute format(
      'update %I x set branch_id = app.root_branch(x.tenant_id) where x.branch_id is null', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_branch_id_fkey');
    execute format('alter table %I alter column branch_id set not null', t);
    execute format(
      'alter table %I add constraint %I foreign key (tenant_id, branch_id) references branches (tenant_id, id)',
      t, t || '_branch_fk');
    execute format(
      'create trigger %I before insert on %I for each row execute function app.fill_branch()',
      t || '_fill_branch', t);
  end loop;
end $$;

-- Números de mesa únicos por sucursal (dos locales pueden tener su "Mesa 1").
alter table restaurant_tables drop constraint if exists restaurant_tables_tenant_id_number_key;
alter table restaurant_tables add constraint restaurant_tables_branch_number_key unique (branch_id, number);

-- ---------------------------------------------------------------------------
-- 4. Delivery = pedido (orders) + datos de reparto (delivery_orders, 1:1)
-- ---------------------------------------------------------------------------
create type order_kind as enum ('mesa', 'llevar', 'delivery');

alter table orders
  add column if not exists kind       order_kind not null default 'mesa',
  add column if not exists updated_at timestamptz not null default now();

alter table order_lines
  add column if not exists sent_qty int not null default 0 check (sent_qty >= 0);

-- Pedidos de delivery ya existentes → pedido + líneas (misma id).
insert into orders (id, tenant_id, branch_id, kind, status, opened_at, closed_at, paid_method, paid_total)
select d.id, d.tenant_id, coalesce(d.branch_id, app.root_branch(d.tenant_id)), 'delivery',
  case d.status
    when 'entregado' then 'cobrada'::order_status
    when 'cancelado' then 'anulada'::order_status
    when 'recibido'  then 'abierta'::order_status
    else 'en_cocina'::order_status
  end,
  d.created_at,
  coalesce(d.delivered_at, d.cancelled_at),
  case when d.status = 'entregado' then
    (case d.pay_method when 'pagado_app' then 'app' else d.pay_method end)::pay_method
  end,
  case when d.status = 'entregado' then d.total end
from delivery_orders d;

insert into order_lines (tenant_id, order_id, name, qty, unit_price, sent_qty, created_at)
select d.tenant_id, d.id, i ->> 'name', (i ->> 'qty')::int, (i ->> 'price')::numeric,
  case when d.status = 'recibido' then 0 else (i ->> 'qty')::int end, d.created_at
from delivery_orders d, jsonb_array_elements(d.items) i;

alter table delivery_orders
  add constraint delivery_orders_order_fk foreign key (id) references orders (id) on delete cascade,
  alter column id drop default,
  add column if not exists updated_at timestamptz not null default now();

drop index if exists delivery_orders_tenant_idx;
alter table delivery_orders
  drop column if exists branch_id,
  drop column if exists items,
  drop column if exists subtotal,
  drop column if exists total,
  drop column if exists created_at;

-- tenant_id se copia del pedido (redundancia controlada: RLS y filtro de Realtime).
create or replace function app.delivery_fill_tenant() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  select tenant_id into new.tenant_id from orders where id = new.id;
  if new.tenant_id is null then
    raise exception 'El pedido % no existe.', new.id using errcode = '23503';
  end if;
  return new;
end $$;

create trigger delivery_orders_fill_tenant
  before insert on delivery_orders
  for each row execute function app.delivery_fill_tenant();

-- Vista de lectura del tablero de delivery (respeta RLS del que consulta).
create view v_delivery_orders with (security_invoker = true) as
select
  d.id, d.tenant_id, o.branch_id, d.code, d.tracking_token, d.channel,
  d.customer_name, d.customer_phone, d.address, d.reference, d.zone_id, d.zone_name,
  coalesce(l.items, '[]'::jsonb) as items,
  coalesce(l.subtotal, 0)::numeric(12,2) as subtotal,
  d.fee,
  (coalesce(l.subtotal, 0) + d.fee)::numeric(12,2) as total,
  d.pay_method, d.cash_for, d.status, d.driver_id, dr.name as driver_name,
  d.notes, d.cancel_reason, d.eta_min,
  o.opened_at as created_at, d.accepted_at, d.ready_at, d.dispatched_at, d.delivered_at, d.cancelled_at,
  greatest(d.updated_at, o.updated_at) as updated_at
from delivery_orders d
join orders o on o.id = d.id
left join delivery_drivers dr on dr.id = d.driver_id
left join lateral (
  select
    jsonb_agg(jsonb_build_object('name', ol.name, 'qty', ol.qty, 'price', ol.unit_price + ol.extra_price)
              order by ol.created_at) as items,
    round(sum(ol.qty * (ol.unit_price + ol.extra_price)), 2) as subtotal
  from order_lines ol
  where ol.order_id = d.id
) l on true;

grant select on v_delivery_orders to authenticated;

-- Seguimiento público: ahora la fecha de creación viene del pedido.
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
    'created_at',    o.opened_at,
    'accepted_at',   d.accepted_at,
    'ready_at',      d.ready_at,
    'dispatched_at', d.dispatched_at,
    'delivered_at',  d.delivered_at,
    'cancelled_at',  d.cancelled_at
  )
  from delivery_orders d
  join orders o on o.id = d.id
  join tenants t on t.id = d.tenant_id
  left join delivery_drivers dr on dr.id = d.driver_id
  where length(p_token) >= 16 and d.tracking_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- 5. Inventario por sucursal: catálogo + stock + kardex
-- ---------------------------------------------------------------------------
create table inventory_stock (
  tenant_id  uuid not null references tenants (id) on delete cascade,
  branch_id  uuid not null,
  item_id    uuid not null references inventory_items (id) on delete cascade,
  qty        numeric(12,3) not null default 0,
  par        numeric(12,3), -- null = usa el par del catálogo
  updated_at timestamptz not null default now(),
  primary key (branch_id, item_id),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create index inventory_stock_tenant_idx on inventory_stock (tenant_id);
create index inventory_stock_item_idx on inventory_stock (item_id);

create table inventory_movements (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  branch_id  uuid not null,
  item_id    uuid not null references inventory_items (id) on delete cascade,
  delta      numeric(12,3) not null,
  reason     text not null check (reason in ('inicial', 'venta', 'ajuste', 'merma', 'compra', 'traslado')),
  order_id   uuid references orders (id) on delete set null,
  actor      text not null default '',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create index inventory_movements_branch_idx on inventory_movements (tenant_id, branch_id, created_at desc);
create index inventory_movements_item_idx on inventory_movements (item_id);
create index inventory_movements_order_idx on inventory_movements (order_id) where order_id is not null;
-- Una venta descuenta cada insumo una sola vez (reintentos idempotentes).
create unique index inventory_movements_sale_once on inventory_movements (order_id, item_id) where reason = 'venta';

-- El stock es la suma del kardex (puede quedar negativo: indica un conteo pendiente).
create or replace function app.inventory_apply_movement() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  insert into inventory_stock (tenant_id, branch_id, item_id, qty)
  values (new.tenant_id, new.branch_id, new.item_id, new.delta)
  on conflict (branch_id, item_id)
  do update set qty = inventory_stock.qty + excluded.qty, updated_at = now();
  return new;
end $$;

create trigger inventory_movements_apply
  after insert on inventory_movements
  for each row execute function app.inventory_apply_movement();

-- Stock actual → sede principal, registrado como movimiento inicial.
insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor)
select i.tenant_id, app.root_branch(i.tenant_id), i.item_id, i.stock, 'inicial', 'Migración'
from (select id as item_id, tenant_id, stock from inventory_items) i
where i.stock <> 0;

alter table inventory_items drop column if exists stock;
alter table inventory_items add column if not exists active boolean not null default true;

alter table inventory_stock enable row level security;
alter table inventory_movements enable row level security;
create policy stock_read on inventory_stock for select using (app.has_tenant(tenant_id));
create policy stock_par on inventory_stock for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
create policy movements_read on inventory_movements for select using (app.has_tenant(tenant_id));
create policy movements_ins on inventory_movements for insert with check (app.can_manage(tenant_id));

-- ---------------------------------------------------------------------------
-- 6. ticket_lines con tenant_id (RLS directa, sin subconsulta por fila)
-- ---------------------------------------------------------------------------
alter table ticket_lines add column if not exists tenant_id uuid references tenants (id) on delete cascade;
update ticket_lines tl set tenant_id = k.tenant_id from kitchen_tickets k where k.id = tl.ticket_id;
alter table ticket_lines alter column tenant_id set not null;

create or replace function app.ticket_lines_fill_tenant() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from kitchen_tickets where id = new.ticket_id;
  end if;
  return new;
end $$;

create trigger ticket_lines_fill_tenant
  before insert on ticket_lines
  for each row execute function app.ticket_lines_fill_tenant();

drop policy if exists tenant_rw on ticket_lines;
create policy tenant_rw on ticket_lines for all
  using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 7. Limpieza de redundancias
-- ---------------------------------------------------------------------------
drop table if exists online_orders;
drop table if exists sunat_credentials;
drop table if exists payroll_entries;

alter table tenants drop column if exists mrr;

-- MRR derivado: precio del plan si el tenant está activo.
create view v_tenants with (security_invoker = true) as
select
  t.*,
  case when t.status = 'Activo' then coalesce(p.price, 0) else 0 end::numeric(10,2) as mrr,
  (select count(*)::int from branches b where b.tenant_id = t.id and b.active) as branches_count
from tenants t
left join subscription_plans p on p.tier = t.plan;

grant select on v_tenants to authenticated;

-- ---------------------------------------------------------------------------
-- 8. updated_at (sincronización incremental) y "toque" del pedido
-- ---------------------------------------------------------------------------
alter table restaurant_tables add column if not exists updated_at timestamptz not null default now();
alter table kitchen_tickets   add column if not exists updated_at timestamptz not null default now();
alter table customers         add column if not exists updated_at timestamptz not null default now();
alter table menu_items        add column if not exists updated_at timestamptz not null default now();
alter table reservations      add column if not exists updated_at timestamptz not null default now();
alter table waitlist          add column if not exists updated_at timestamptz not null default now();

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'restaurant_tables', 'kitchen_tickets', 'delivery_orders', 'customers',
                           'menu_items', 'reservations', 'waitlist', 'inventory_stock']
  loop
    execute format(
      'create trigger %I before update on %I for each row execute function app.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- Un cambio en las líneas marca el pedido como modificado: la sincronización
-- incremental trae el pedido completo (con sus líneas) y detecta borrados.
create or replace function app.order_lines_touch_order() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  update orders set updated_at = now()
  where id = case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    update orders set updated_at = now() where id = old.order_id;
  end if;
  return null;
end $$;

create trigger order_lines_touch_order
  after insert or update or delete on order_lines
  for each row execute function app.order_lines_touch_order();

-- ---------------------------------------------------------------------------
-- 9. Índices según los accesos reales
-- ---------------------------------------------------------------------------
-- Pedidos abiertos por sucursal (mesas, cuentas, sincronización).
create index orders_open_idx on orders (tenant_id, branch_id) where status not in ('cobrada', 'anulada');
-- Historial de ventas (reportes, caja, comparativa de sucursales).
create index orders_paid_idx on orders (tenant_id, closed_at desc) where status = 'cobrada';
-- Delta de sincronización.
create index orders_updated_idx on orders (tenant_id, updated_at);
create index orders_customer_idx on orders (customer_id) where customer_id is not null;
create index orders_waiter_idx on orders (waiter_id) where waiter_id is not null;
drop index if exists orders_tenant_id_idx; -- cubierto por los índices anteriores

create index order_lines_menu_item_idx on order_lines (menu_item_id) where menu_item_id is not null;

drop index if exists kitchen_tickets_branch;
create index kitchen_tickets_open_idx on kitchen_tickets (tenant_id, branch_id, entered_at) where col <> 'entregado';
create index kitchen_tickets_updated_idx on kitchen_tickets (tenant_id, updated_at);
create index kitchen_tickets_order_idx on kitchen_tickets (order_id) where order_id is not null;
create index ticket_lines_ticket_idx on ticket_lines (ticket_id);

create index delivery_orders_status_idx on delivery_orders (tenant_id, status);
create index delivery_orders_updated_idx on delivery_orders (tenant_id, updated_at);
create index delivery_orders_driver_idx on delivery_orders (driver_id) where driver_id is not null;

create index restaurant_tables_branch_idx on restaurant_tables (tenant_id, branch_id);

create index activity_log_tenant_created_idx on activity_log (tenant_id, created_at desc);
create index comprobantes_issued_idx on comprobantes (tenant_id, issued_at desc);
create index comprobantes_order_idx on comprobantes (order_id) where order_id is not null;
create index comprobantes_queue_idx on comprobantes (tenant_id) where status = 'encola';
create index sunat_outbox_cpe_idx on sunat_outbox (comprobante_id);
create index loyalty_tx_customer_idx on loyalty_transactions (customer_id);
create index loyalty_tx_order_idx on loyalty_transactions (order_id) where order_id is not null;
create index void_events_order_idx on void_events (order_id) where order_id is not null;
create index recipes_menu_item_idx on recipes (menu_item_id);
create index recipes_inventory_idx on recipes (inventory_id);
create index menu_items_category_idx on menu_items (category_id);
create index reservations_date_idx on reservations (tenant_id, res_date);
create index waitlist_created_idx on waitlist (tenant_id, created_at);
create index cash_closes_idx on cash_register_closes (tenant_id, branch_id, closed_at desc);

-- ---------------------------------------------------------------------------
-- 10. RLS con InitPlan: reescribe todas las políticas existentes.
--   app.has_tenant(x)       → ((select is_platform_admin()) or x = any((select my_tenant_ids())))
--   app.can_manage(x)       → ((select is_platform_admin()) or x = any((select my_managed_tenant_ids())))
--   app.is_platform_admin() → (select app.is_platform_admin())
--   auth.uid()              → (select auth.uid())
-- ---------------------------------------------------------------------------
create or replace function app.initplan_expr(e text) returns text
language plpgsql immutable as $$
begin
  if e is null then
    return null;
  end if;
  e := replace(e, 'auth.uid()', '(select auth.uid())');
  e := replace(e, 'app.is_platform_admin()', '(select app.is_platform_admin())');
  e := regexp_replace(e, 'app\.has_tenant\(([^()]+)\)',
    '((select app.is_platform_admin()) or \1 = any ((select app.my_tenant_ids())::uuid[]))', 'g');
  e := regexp_replace(e, 'app\.can_manage\(([^()]+)\)',
    '((select app.is_platform_admin()) or \1 = any ((select app.my_managed_tenant_ids())::uuid[]))', 'g');
  return e;
end $$;

do $$
declare
  p record;
  q text;
  c text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := app.initplan_expr(p.qual);
    c := app.initplan_expr(p.with_check);
    if q is not distinct from p.qual and c is not distinct from p.with_check then
      continue;
    end if;
    execute format('alter policy %I on %I', p.policyname, p.tablename)
      || case when q is not null then format(' using (%s)', q) else '' end
      || case when c is not null then format(' with check (%s)', c) else '' end;
  end loop;
end $$;

drop function app.initplan_expr(text);

-- ---------------------------------------------------------------------------
-- 11. Realtime: tablas operativas en la publicación (sin esto no llegan eventos)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['orders', 'kitchen_tickets', 'restaurant_tables', 'delivery_orders']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
