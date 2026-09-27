-- =============================================================================
-- 0032 · Operaciones del POS atómicas, idempotentes y aptas para offline
--
-- El dispositivo describe cada acción como una operación con id propio
-- ({id, type, at, actor, ...}). Si hay internet se envía al momento; si no, se
-- guarda en una cola local y se envía al volver la conexión. El servidor:
--   · aplica cada operación en su propia subtransacción (todo o nada),
--   · la registra en pos_ops: reenviarla nunca duplica una venta,
--   · respeta la hora real en que ocurrió (`at`) para reportes y caja,
--   · resuelve conflictos entre dispositivos (dos meseros abren la misma mesa
--     sin conexión → los pedidos se unen; cobrar un pedido ya cobrado → error
--     legible que el dispositivo muestra para revisión).
--
-- pos_snapshot entrega en UNA llamada el estado operativo (mesas, pedidos
-- abiertos con líneas, comandas, delivery), completo o solo lo cambiado desde
-- una marca de tiempo (sincronización incremental).
--
-- Terminales: cada caja que emite comprobantes tiene su propia serie SUNAT
-- (B001/F001, B002/F002…). Así numera sin conexión sin chocar con otra caja.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tablas de soporte
-- ---------------------------------------------------------------------------
create table pos_ops (
  id         uuid primary key,
  tenant_id  uuid not null references tenants (id) on delete cascade,
  device_id  text not null default '',
  type       text not null,
  status     text not null check (status in ('ok', 'error')),
  result     jsonb,
  error      text,
  client_at  timestamptz,
  applied_at timestamptz not null default now()
);
create index pos_ops_tenant_idx on pos_ops (tenant_id, applied_at desc);
alter table pos_ops enable row level security;
create policy pos_ops_read on pos_ops for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));

-- Pedido abierto sin conexión en una mesa que otro dispositivo ya había abierto:
-- sus operaciones se redirigen al pedido existente.
create table order_redirects (
  from_id    uuid primary key,
  to_id      uuid not null references orders (id) on delete cascade,
  tenant_id  uuid not null references tenants (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index order_redirects_to_idx on order_redirects (to_id);
alter table order_redirects enable row level security;
create policy order_redirects_read on order_redirects for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));

create table pos_terminals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  branch_id     uuid not null,
  device_id     text not null,
  name          text not null default '',
  serie_boleta  text not null check (serie_boleta ~ '^B[0-9A-Z]{3}$'),
  serie_factura text not null check (serie_factura ~ '^F[0-9A-Z]{3}$'),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (tenant_id, device_id),
  unique (tenant_id, serie_boleta),
  unique (tenant_id, serie_factura),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id)
);
alter table pos_terminals enable row level security;
create policy pos_terminals_read on pos_terminals for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));
create policy pos_terminals_mgr on pos_terminals for update using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))
  with check ((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- Folios: formato serie-correlativo sin truncar (lpad recortaba a 4 dígitos).
-- ---------------------------------------------------------------------------
create or replace function app.format_folio(p_serie text, n int) returns text
language sql immutable as $$
  select p_serie || '-' || lpad(n::text, greatest(4, length(n::text)), '0');
$$;

create or replace function public.next_folio(tid uuid, p_serie text) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  n integer;
begin
  if not app.has_tenant(tid) then
    raise exception 'no autorizado';
  end if;
  insert into folio_counters (tenant_id, serie, last)
  values (tid, p_serie, 1001)
  on conflict (tenant_id, serie) do update set last = folio_counters.last + 1
  returning last into n;
  return app.format_folio(p_serie, n);
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.pos_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin() or p_tenant = any (app.my_tenant_ids());
$$;

create or replace function app.pos_log(p_tenant uuid, p_actor text, p_message text) returns void
language sql security definer set search_path = public, app as $$
  insert into activity_log (tenant_id, actor, message) values (p_tenant, coalesce(nullif(p_actor, ''), 'POS'), p_message);
$$;

-- Pedido abierto (resolviendo redirecciones), bloqueado para la operación.
create or replace function app.pos_open_order(p_tenant uuid, p_id uuid) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  o orders;
begin
  select * into o from orders
  where tenant_id = p_tenant
    and id = coalesce((select to_id from order_redirects where from_id = p_id and tenant_id = p_tenant), p_id)
  for update;
  if not found then
    raise exception 'El pedido ya no existe.' using errcode = 'P0001';
  end if;
  if o.status in ('cobrada', 'anulada') then
    raise exception 'El pedido ya fue % en otro dispositivo.', case o.status when 'cobrada' then 'cobrado' else 'anulado' end
      using errcode = 'P0001';
  end if;
  return o;
end $$;

-- Etiqueta visible de un pedido (mesa o código de delivery).
create or replace function app.order_label(o orders) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when o.kind = 'delivery' then '🛵 ' || coalesce((select code from delivery_orders where id = o.id), 'Delivery')
    when o.table_id is not null then 'Mesa ' || coalesce((select number::text from restaurant_tables where id = o.table_id), '—')
    else 'Para llevar'
  end;
$$;

-- Envía a cocina SOLO lo que falta enviar (qty - sent_qty) en una comanda nueva.
create or replace function app.pos_send_kitchen(o orders, p_ticket uuid, p_note text) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_ticket uuid := coalesce(p_ticket, gen_random_uuid());
  n        int;
begin
  select count(*) into n from order_lines where order_id = o.id and qty > sent_qty;
  if n = 0 then
    return 0;
  end if;
  insert into kitchen_tickets (id, tenant_id, order_id, branch_id, table_label, col, note)
  values (v_ticket, o.tenant_id, o.id, o.branch_id, app.order_label(o), 'nuevos', coalesce(p_note, ''))
  on conflict (id) do nothing;
  if not found then
    return 0; -- reintento: la comanda ya existe
  end if;
  insert into ticket_lines (tenant_id, ticket_id, qty, name)
  select o.tenant_id, v_ticket, qty - sent_qty,
         name || case when modifiers <> '' then ' · ' || modifiers else '' end
  from order_lines
  where order_id = o.id and qty > sent_qty
  order by created_at;
  update order_lines set sent_qty = qty where order_id = o.id and qty > sent_qty;
  update orders set status = 'en_cocina' where id = o.id and status = 'abierta';
  return n;
end $$;

-- Descuenta insumos según receta en la sucursal del pedido (una sola vez por venta).
create or replace function app.pos_deduct_inventory(o orders) returns void
language sql security definer set search_path = public, app as $$
  insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, order_id, actor)
  select o.tenant_id, o.branch_id, r.inventory_id, -round(sum(r.qty_per_unit * ol.qty), 3), 'venta', o.id, 'Venta'
  from order_lines ol
  join recipes r on r.menu_item_id = ol.menu_item_id and r.tenant_id = o.tenant_id
  where ol.order_id = o.id
  group by r.inventory_id
  on conflict (order_id, item_id) where reason = 'venta' do nothing;
$$;

-- Libera la mesa si ya no le queda ningún pedido abierto.
create or replace function app.pos_free_table(p_table uuid) returns void
language sql security definer set search_path = public, app as $$
  update restaurant_tables t set status = 'libre'
  where t.id = p_table
    and not exists (select 1 from orders where table_id = p_table and status not in ('cobrada', 'anulada'));
$$;

-- ---------------------------------------------------------------------------
-- Ejecución de UNA operación
-- ---------------------------------------------------------------------------
create or replace function app.pos_exec(p_tenant uuid, op jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_type   text := op ->> 'type';
  v_at     timestamptz := least(coalesce((op ->> 'at')::timestamptz, now()), now());
  v_actor  text := coalesce(nullif(op ->> 'actor', ''), 'POS');
  o        orders;
  t        restaurant_tables;
  d        delivery_orders;
  k        kitchen_tickets;
  v_id     uuid;
  v_other  uuid;
  v_n      int;
  v_num    numeric;
  v_text   text;
  v_json   jsonb;
begin
  case v_type

  -- ── Mesas y pedidos ────────────────────────────────────────────────────────
  when 'order.open' then
    v_id := (op ->> 'order_id')::uuid;
    select * into t from restaurant_tables
    where id = (op ->> 'table_id')::uuid and tenant_id = p_tenant for update;
    if not found then
      raise exception 'La mesa ya no existe.' using errcode = 'P0001';
    end if;
    if exists (select 1 from orders where id = v_id and tenant_id = p_tenant) then
      return jsonb_build_object('order_id', v_id);
    end if;
    select id into v_other from orders
    where table_id = t.id and status not in ('cobrada', 'anulada')
    order by opened_at limit 1;
    if v_other is not null then
      insert into order_redirects (from_id, to_id, tenant_id) values (v_id, v_other, p_tenant)
      on conflict (from_id) do nothing;
      return jsonb_build_object('order_id', v_other, 'redirected', true);
    end if;
    insert into orders (id, tenant_id, branch_id, table_id, kind, status, opened_at)
    values (v_id, p_tenant, t.branch_id, t.id, 'mesa', 'abierta', v_at);
    update restaurant_tables set status = 'ocupada' where id = t.id;
    return jsonb_build_object('order_id', v_id);

  when 'line.add' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    insert into order_lines (id, tenant_id, order_id, menu_item_id, name, qty, unit_price, extra_price, modifiers, created_at)
    values (
      (op ->> 'line_id')::uuid, p_tenant, o.id, nullif(op ->> 'item_id', '')::uuid, op ->> 'name',
      greatest(1, (op ->> 'qty')::int), (op ->> 'unit_price')::numeric,
      coalesce((op ->> 'extra_price')::numeric, 0), coalesce(op ->> 'modifiers', ''), v_at)
    on conflict (id) do nothing;
    return jsonb_build_object('order_id', o.id);

  when 'line.qty', 'line.remove', 'line.void' then
    select ol.order_id, ol.name into v_id, v_text from order_lines ol
    where ol.id = (op ->> 'line_id')::uuid and ol.tenant_id = p_tenant;
    if v_id is null then
      return jsonb_build_object('skipped', 'line_gone'); -- otro dispositivo ya la quitó
    end if;
    o := app.pos_open_order(p_tenant, v_id);
    v_n := case when v_type = 'line.qty' then (op ->> 'qty')::int else 0 end;
    if v_n > 0 then
      update order_lines set qty = v_n, sent_qty = least(sent_qty, v_n) where id = (op ->> 'line_id')::uuid;
    else
      delete from order_lines where id = (op ->> 'line_id')::uuid;
    end if;
    if v_type = 'line.void' then
      insert into void_events (tenant_id, order_id, line_name, reason)
      values (p_tenant, o.id, v_text, coalesce(op ->> 'reason', ''));
      perform app.pos_log(p_tenant, v_actor, format('Anuló %s · %s', v_text, coalesce(op ->> 'reason', '')));
    end if;
    return '{}'::jsonb;

  when 'order.clear' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    delete from order_lines where order_id = o.id and sent_qty = 0;
    return '{}'::jsonb;

  when 'order.send' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    v_n := app.pos_send_kitchen(o, (op ->> 'ticket_id')::uuid, op ->> 'note');
    if v_n > 0 then
      perform app.pos_log(p_tenant, v_actor, format('Envió comanda de %s a cocina', app.order_label(o)));
    end if;
    return jsonb_build_object('lines', v_n);

  when 'order.pay' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    v_num := greatest(0, (op ->> 'total')::numeric - coalesce((op ->> 'redeem')::int, 0));
    update orders set
      status = 'cobrada',
      closed_at = v_at,
      paid_method = (op ->> 'method')::pay_method,
      paid_total = round(v_num, 2),
      customer_id = coalesce(nullif(op ->> 'customer_id', '')::uuid, customer_id)
    where id = o.id
    returning * into o;
    if o.table_id is not null then
      perform app.pos_free_table(o.table_id);
    end if;
    perform app.pos_deduct_inventory(o);
    if o.customer_id is not null then
      v_n := floor(v_num / 10);
      update customers set
        points = greatest(0, points - coalesce((op ->> 'redeem')::int, 0) + v_n),
        visits = visits + 1,
        spent = spent + v_num
      where id = o.customer_id and tenant_id = p_tenant;
      insert into loyalty_transactions (tenant_id, customer_id, order_id, points_delta)
      values (p_tenant, o.customer_id, o.id, v_n - coalesce((op ->> 'redeem')::int, 0));
    end if;
    perform app.pos_log(p_tenant, v_actor,
      format('Cobró %s · %s · S/ %s', app.order_label(o), op ->> 'method', to_char(v_num, 'FM999999990.00')));
    return jsonb_build_object('paid_total', o.paid_total);

  when 'order.transfer' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    select * into t from restaurant_tables
    where id = (op ->> 'to_table_id')::uuid and tenant_id = p_tenant for update;
    if not found then
      raise exception 'La mesa destino ya no existe.' using errcode = 'P0001';
    end if;
    if t.branch_id <> o.branch_id then
      raise exception 'Solo se puede transferir a una mesa de la misma sucursal.' using errcode = 'P0001';
    end if;
    if exists (select 1 from orders where table_id = t.id and status not in ('cobrada', 'anulada') and id <> o.id) then
      raise exception 'La Mesa % ya tiene un pedido; usa «Unir».', t.number using errcode = 'P0001';
    end if;
    v_other := o.table_id;
    update orders set table_id = t.id where id = o.id;
    update restaurant_tables set status = 'ocupada' where id = t.id;
    if v_other is not null then
      perform app.pos_free_table(v_other);
    end if;
    perform app.pos_log(p_tenant, v_actor, format('Transfirió pedido a Mesa %s', t.number));
    return '{}'::jsonb;

  when 'order.merge' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    select id into v_other from orders
    where table_id = (op ->> 'into_table_id')::uuid and tenant_id = p_tenant
      and status not in ('cobrada', 'anulada') and id <> o.id
    order by opened_at limit 1
    for update;
    if v_other is null then
      raise exception 'La mesa destino no tiene un pedido abierto.' using errcode = 'P0001';
    end if;
    update order_lines set order_id = v_other where order_id = o.id;
    update kitchen_tickets set order_id = v_other where order_id = o.id;
    update orders set status = 'anulada', closed_at = v_at where id = o.id;
    insert into order_redirects (from_id, to_id, tenant_id) values (o.id, v_other, p_tenant)
    on conflict (from_id) do update set to_id = excluded.to_id;
    if o.table_id is not null then
      perform app.pos_free_table(o.table_id);
    end if;
    perform app.pos_log(p_tenant, v_actor, format('Unió %s con otra mesa', app.order_label(o)));
    return jsonb_build_object('order_id', v_other);

  -- ── Cocina ─────────────────────────────────────────────────────────────────
  when 'ticket.advance' then
    select * into k from kitchen_tickets
    where id = (op ->> 'ticket_id')::uuid and tenant_id = p_tenant for update;
    if not found or k.col::text <> coalesce(op ->> 'from', k.col::text) then
      return jsonb_build_object('skipped', 'already_moved'); -- otro dispositivo ya la movió
    end if;
    update kitchen_tickets set
      col = case k.col when 'nuevos' then 'preparacion' when 'preparacion' then 'listos' else 'entregado' end::kds_column,
      entered_at = now(),
      done = k.col in ('preparacion', 'listos', 'entregado')
    where id = k.id;
    return '{}'::jsonb;

  -- ── Delivery ───────────────────────────────────────────────────────────────
  when 'delivery.create' then
    v_id := (op ->> 'order_id')::uuid;
    select * into d from delivery_orders where id = v_id and tenant_id = p_tenant;
    if found then
      return jsonb_build_object('code', d.code, 'tracking_token', d.tracking_token);
    end if;
    if coalesce(jsonb_array_length(op -> 'lines'), 0) = 0 then
      raise exception 'Agrega al menos un plato.' using errcode = 'P0001';
    end if;
    if coalesce(trim(op ->> 'customer_name'), '') = '' then
      raise exception 'Falta el nombre del cliente.' using errcode = 'P0001';
    end if;
    v_other := coalesce(
      (select id from branches where id = nullif(op ->> 'branch_id', '')::uuid and tenant_id = p_tenant),
      app.root_branch(p_tenant));
    insert into orders (id, tenant_id, branch_id, kind, status, opened_at)
    values (v_id, p_tenant, v_other, 'delivery', 'abierta', v_at);
    insert into order_lines (id, tenant_id, order_id, menu_item_id, name, qty, unit_price, created_at)
    select coalesce(nullif(l ->> 'line_id', '')::uuid, gen_random_uuid()), p_tenant, v_id,
           nullif(l ->> 'item_id', '')::uuid, l ->> 'name', greatest(1, (l ->> 'qty')::int), (l ->> 'price')::numeric, v_at
    from jsonb_array_elements(op -> 'lines') l;
    v_text := op ->> 'channel';
    if v_text in ('rappi', 'pedidosya') then
      insert into delivery_orders (id, channel, customer_name, customer_phone, address, reference,
                                   fee, pay_method, cash_for, notes, eta_min)
      values (v_id, v_text, trim(op ->> 'customer_name'), coalesce(op ->> 'customer_phone', ''),
              coalesce(op ->> 'address', ''), coalesce(op ->> 'reference', ''),
              0, coalesce(op ->> 'pay_method', 'pagado_app'), null, coalesce(op ->> 'notes', ''), 30)
      returning * into d;
    else
      if coalesce(trim(op ->> 'address'), '') = '' then
        raise exception 'Falta la dirección de entrega.' using errcode = 'P0001';
      end if;
      insert into delivery_orders (id, channel, customer_name, customer_phone, address, reference,
                                   zone_id, zone_name, fee, pay_method, cash_for, notes, eta_min)
      select v_id, v_text, trim(op ->> 'customer_name'), coalesce(op ->> 'customer_phone', ''),
             trim(op ->> 'address'), coalesce(op ->> 'reference', ''),
             z.id, z.name, z.fee, op ->> 'pay_method',
             case when op ->> 'pay_method' = 'efectivo' then nullif(op ->> 'cash_for', '')::numeric end,
             coalesce(op ->> 'notes', ''), z.eta_min
      from delivery_zones z
      where z.id = nullif(op ->> 'zone_id', '')::uuid and z.tenant_id = p_tenant and z.active
      returning * into d;
      if d.id is null then
        raise exception 'Elige una zona de reparto activa.' using errcode = 'P0001';
      end if;
    end if;
    perform app.pos_log(p_tenant, v_actor, format('Nuevo delivery %s (%s)', d.code, d.channel));
    return jsonb_build_object('code', d.code, 'tracking_token', d.tracking_token);

  when 'delivery.status' then
    select * into d from delivery_orders
    where id = (op ->> 'order_id')::uuid and tenant_id = p_tenant for update;
    if not found then
      raise exception 'El pedido de delivery ya no existe.' using errcode = 'P0001';
    end if;
    v_text := op ->> 'to';
    if d.status::text = v_text then
      return jsonb_build_object('skipped', 'same_status');
    end if;
    if d.status::text <> coalesce(op ->> 'from', d.status::text) then
      raise exception 'Otro usuario ya movió % a «%».', d.code, d.status using errcode = 'P0001';
    end if;
    if d.status in ('entregado', 'cancelado')
       or (v_text <> 'cancelado' and v_text <> case d.status
             when 'recibido' then 'preparando' when 'preparando' then 'listo'
             when 'listo' then 'en_camino' when 'en_camino' then 'entregado' end) then
      raise exception 'No se puede pasar de «%» a «%».', d.status, v_text using errcode = 'P0001';
    end if;
    select * into o from orders where id = d.id for update;
    if v_text = 'preparando' then
      d.accepted_at := v_at;
      perform app.pos_send_kitchen(o, (op ->> 'ticket_id')::uuid, d.notes);
    elsif v_text = 'listo' then
      d.ready_at := v_at;
    elsif v_text = 'en_camino' then
      d.driver_id := coalesce(nullif(op ->> 'driver_id', '')::uuid, d.driver_id);
      if d.channel not in ('rappi', 'pedidosya') then
        if d.driver_id is null then
          raise exception 'Asigna un repartidor para despachar.' using errcode = 'P0001';
        end if;
        if not exists (select 1 from delivery_drivers where id = d.driver_id and tenant_id = p_tenant and active) then
          raise exception 'Ese repartidor no está disponible.' using errcode = 'P0001';
        end if;
      end if;
      d.dispatched_at := v_at;
    elsif v_text = 'entregado' then
      d.delivered_at := v_at;
      update orders set
        status = 'cobrada',
        closed_at = v_at,
        paid_method = (case d.pay_method when 'pagado_app' then 'app' else d.pay_method end)::pay_method,
        paid_total = round((select coalesce(sum(qty * (unit_price + extra_price)), 0) from order_lines where order_id = o.id) + d.fee, 2)
      where id = o.id
      returning * into o;
      perform app.pos_deduct_inventory(o);
    elsif v_text = 'cancelado' then
      if coalesce(trim(op ->> 'cancel_reason'), '') = '' then
        raise exception 'Indica el motivo de la cancelación.' using errcode = 'P0001';
      end if;
      d.cancel_reason := trim(op ->> 'cancel_reason');
      d.cancelled_at := v_at;
      update orders set status = 'anulada', closed_at = v_at where id = o.id;
      update kitchen_tickets set col = 'entregado', done = true, note = 'CANCELADO · ' || d.cancel_reason
      where order_id = o.id and col <> 'entregado';
    end if;
    update delivery_orders set
      status = v_text::delivery_status,
      driver_id = d.driver_id,
      accepted_at = d.accepted_at, ready_at = d.ready_at, dispatched_at = d.dispatched_at,
      delivered_at = d.delivered_at, cancelled_at = d.cancelled_at, cancel_reason = d.cancel_reason
    where id = d.id;
    perform app.pos_log(p_tenant, v_actor,
      format('%s → %s%s', d.code, v_text, case when d.cancel_reason is not null then ' (' || d.cancel_reason || ')' else '' end));
    return '{}'::jsonb;

  -- ── Inventario ─────────────────────────────────────────────────────────────
  when 'inventory.adjust' then
    if not (app.is_platform_admin() or p_tenant = any (app.my_managed_tenant_ids())) then
      raise exception 'Solo gerencia puede ajustar el inventario.' using errcode = 'P0001';
    end if;
    select name into v_text from inventory_items where id = (op ->> 'item_id')::uuid and tenant_id = p_tenant;
    if v_text is null then
      raise exception 'El insumo ya no existe.' using errcode = 'P0001';
    end if;
    v_other := coalesce(
      (select id from branches where id = nullif(op ->> 'branch_id', '')::uuid and tenant_id = p_tenant),
      app.root_branch(p_tenant));
    v_num := (op ->> 'delta')::numeric;
    insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor, created_at)
    values (p_tenant, v_other, (op ->> 'item_id')::uuid, v_num,
            coalesce(nullif(op ->> 'reason', ''), 'ajuste'), v_actor, v_at);
    perform app.pos_log(p_tenant, v_actor,
      format('Ajustó %s (%s%s)', v_text, case when v_num > 0 then '+' else '' end, v_num));
    return '{}'::jsonb;

  -- ── Comprobantes (numeración de la terminal, válida sin conexión) ─────────
  when 'cpe.emit' then
    v_id := (op ->> 'cpe_id')::uuid;
    select jsonb_build_object('folio', folio, 'status', status) into v_json
    from comprobantes where id = v_id and tenant_id = p_tenant;
    if v_json is not null then
      return v_json;
    end if;
    v_text := op ->> 'serie';
    if v_text is null or v_text !~ '^[BF][0-9A-Z]{3}$' then
      raise exception 'Serie de comprobante inválida.' using errcode = 'P0001';
    end if;
    v_n := nullif(op ->> 'number', '')::int;
    -- Número propuesto por la terminal; si ya se usó, el servidor asigna el siguiente.
    if v_n is null or exists (select 1 from comprobantes where tenant_id = p_tenant and folio = app.format_folio(v_text, v_n)) then
      insert into folio_counters (tenant_id, serie, last) values (p_tenant, v_text, 1001)
      on conflict (tenant_id, serie) do update set last = folio_counters.last + 1
      returning last into v_n;
    else
      insert into folio_counters (tenant_id, serie, last) values (p_tenant, v_text, v_n)
      on conflict (tenant_id, serie) do update set last = greatest(folio_counters.last, excluded.last);
    end if;
    insert into comprobantes (id, tenant_id, order_id, folio, tipo, buyer_ruc, buyer_name,
                              subtotal, igv, total, reference, status, issued_at)
    values (v_id, p_tenant,
            (select id from orders where id = nullif(op ->> 'order_id', '')::uuid and tenant_id = p_tenant),
            app.format_folio(v_text, v_n), (op ->> 'tipo')::comprobante_tipo,
            nullif(op ->> 'buyer_ruc', ''), nullif(op ->> 'buyer_name', ''),
            (op ->> 'subtotal')::numeric, (op ->> 'igv')::numeric, (op ->> 'total')::numeric,
            coalesce(op ->> 'reference', ''), 'encola', v_at);
    insert into sunat_outbox (tenant_id, comprobante_id) values (p_tenant, v_id);
    perform app.pos_log(p_tenant, v_actor, format('Emitió %s %s · en cola', op ->> 'tipo', app.format_folio(v_text, v_n)));
    return jsonb_build_object('folio', app.format_folio(v_text, v_n), 'status', 'encola');

  else
    raise exception 'Operación desconocida: %', v_type using errcode = 'P0001';
  end case;
end $$;

-- ---------------------------------------------------------------------------
-- API: aplicar un lote de operaciones (en orden, cada una atómica)
-- ---------------------------------------------------------------------------
create or replace function public.pos_apply(p_tenant uuid, p_device text, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  op      jsonb;
  v_id    uuid;
  v_res   jsonb;
  v_prev  pos_ops;
  results jsonb := '[]'::jsonb;
begin
  if not app.pos_member(p_tenant) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'Lote inválido (máximo 200 operaciones).' using errcode = '22023';
  end if;

  for op in select value from jsonb_array_elements(p_ops)
  loop
    v_id := (op ->> 'id')::uuid;
    begin
      -- Reserva el id: un reenvío (o el mismo lote en paralelo) no se aplica dos veces.
      insert into pos_ops (id, tenant_id, device_id, type, status, client_at)
      values (v_id, p_tenant, coalesce(p_device, ''), op ->> 'type', 'ok', (op ->> 'at')::timestamptz)
      on conflict (id) do nothing;
      if not found then
        select * into v_prev from pos_ops where id = v_id and tenant_id = p_tenant;
        results := results || jsonb_build_array(jsonb_build_object(
          'id', v_id, 'status', coalesce(v_prev.status, 'error'), 'dup', true,
          'result', v_prev.result, 'error', case when v_prev.id is null then 'Id de operación inválido.' else v_prev.error end));
        continue;
      end if;

      v_res := app.pos_exec(p_tenant, op);
      update pos_ops set result = v_res where id = v_id;
      results := results || jsonb_build_array(jsonb_build_object('id', v_id, 'status', 'ok', 'result', v_res));
    exception
      -- Rechazos de negocio o de datos: definitivos. Se registran para que un
      -- reenvío devuelva la misma respuesta. Otros errores (bloqueos, caídas)
      -- abortan el lote y el dispositivo reintenta más tarde.
      when sqlstate 'P0001' or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008'
        or sqlstate '23502' or sqlstate '23503' or sqlstate '23505' or sqlstate '23514' or sqlstate '42501' then
        insert into pos_ops (id, tenant_id, device_id, type, status, error, client_at)
        values (v_id, p_tenant, coalesce(p_device, ''), op ->> 'type', 'error', sqlerrm, (op ->> 'at')::timestamptz)
        on conflict (id) do nothing;
        results := results || jsonb_build_array(jsonb_build_object(
          'id', v_id, 'status', 'error', 'error', sqlerrm, 'code', sqlstate));
    end;
  end loop;
  return results;
end $$;

grant execute on function public.pos_apply(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- API: estado operativo (completo o incremental) en una sola llamada
-- ---------------------------------------------------------------------------
create or replace function public.pos_snapshot(p_tenant uuid, p_branch uuid default null, p_since timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
  if not app.pos_member(p_tenant) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'server_time', now(),
    'full', p_since is null,

    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'zone', t.zone, 'number', t.number, 'seats', t.seats, 'status', t.status,
        'waiter_id', t.waiter_id, 'branch_id', t.branch_id) order by t.number), '[]'::jsonb)
      from restaurant_tables t
      where t.tenant_id = p_tenant
        and (p_branch is null or t.branch_id = p_branch)
        and (p_since is null or t.updated_at > p_since)),

    -- En incremental, la lista de ids permite detectar mesas eliminadas.
    'table_ids', case when p_since is null then null else (
      select coalesce(jsonb_agg(t.id), '[]'::jsonb) from restaurant_tables t
      where t.tenant_id = p_tenant and (p_branch is null or t.branch_id = p_branch)) end,

    'orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'table_id', o.table_id, 'table_number', t.number, 'seats', t.seats, 'zone', t.zone,
        'kind', o.kind, 'status', o.status, 'opened_at', o.opened_at, 'closed_at', o.closed_at,
        'paid_method', o.paid_method, 'paid_total', o.paid_total, 'branch_id', o.branch_id,
        'customer_id', o.customer_id,
        'lines', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'item_id', l.menu_item_id, 'name', l.name, 'qty', l.qty,
            'unit_price', l.unit_price, 'extra_price', l.extra_price, 'modifiers', l.modifiers,
            'split_payer', l.split_payer, 'sent_qty', l.sent_qty) order by l.created_at), '[]'::jsonb)
          from order_lines l where l.order_id = o.id)
      ) order by o.opened_at), '[]'::jsonb)
      from orders o
      left join restaurant_tables t on t.id = o.table_id
      where o.tenant_id = p_tenant
        and o.kind <> 'delivery'
        and (p_branch is null or o.branch_id = p_branch)
        and (case when p_since is null then o.status not in ('cobrada', 'anulada')
                  else o.updated_at > p_since end)),

    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'order_id', k.order_id, 'table_label', k.table_label, 'col', k.col,
        'entered_at', k.entered_at, 'note', k.note, 'done', k.done, 'branch_id', k.branch_id,
        'lines', (
          select coalesce(jsonb_agg(jsonb_build_object('qty', tl.qty, 'name', tl.name)), '[]'::jsonb)
          from ticket_lines tl where tl.ticket_id = k.id)
      ) order by k.entered_at), '[]'::jsonb)
      from kitchen_tickets k
      where k.tenant_id = p_tenant
        and (p_branch is null or k.branch_id = p_branch)
        and (case when p_since is null then k.col <> 'entregado' else k.updated_at > p_since end)),

    'deliveries', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc), '[]'::jsonb)
      from v_delivery_orders v
      where v.tenant_id = p_tenant
        and (p_branch is null or v.branch_id = p_branch)
        and (case when p_since is null
                  then v.status in ('recibido', 'preparando', 'listo', 'en_camino') or v.created_at >= v_today
                  else v.updated_at > p_since end))
  );
end $$;

grant execute on function public.pos_snapshot(uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- API: registro de la terminal (caja) y su serie propia
-- ---------------------------------------------------------------------------
create or replace function public.pos_terminal(p_tenant uuid, p_device text, p_branch uuid default null, p_name text default '')
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  term pos_terminals;
  n    int;
begin
  if not app.pos_member(p_tenant) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  if coalesce(length(p_device), 0) < 8 then
    raise exception 'Identificador de dispositivo inválido.' using errcode = '22023';
  end if;
  select * into term from pos_terminals where tenant_id = p_tenant and device_id = p_device;
  if not found then
    perform 1 from tenants where id = p_tenant for update; -- serializa la asignación de series
    select coalesce(max(substr(serie_boleta, 2)::int), 0) + 1 into n
    from pos_terminals where tenant_id = p_tenant and serie_boleta ~ '^B[0-9]{3}$';
    if n > 999 then
      raise exception 'Se alcanzó el máximo de terminales.' using errcode = 'P0001';
    end if;
    insert into pos_terminals (tenant_id, branch_id, device_id, name, serie_boleta, serie_factura)
    values (p_tenant,
            coalesce((select id from branches where id = p_branch and tenant_id = p_tenant), app.root_branch(p_tenant)),
            p_device, coalesce(nullif(p_name, ''), 'Caja ' || n),
            'B' || lpad(n::text, 3, '0'), 'F' || lpad(n::text, 3, '0'))
    returning * into term;
  else
    update pos_terminals set last_seen_at = now() where id = term.id;
  end if;
  return jsonb_build_object(
    'id', term.id, 'name', term.name, 'branch_id', term.branch_id,
    'serie_boleta', term.serie_boleta, 'serie_factura', term.serie_factura,
    'last_boleta', coalesce((select last from folio_counters where tenant_id = p_tenant and serie = term.serie_boleta), 1000),
    'last_factura', coalesce((select last from folio_counters where tenant_id = p_tenant and serie = term.serie_factura), 1000));
end $$;

grant execute on function public.pos_terminal(uuid, text, uuid, text) to authenticated;
