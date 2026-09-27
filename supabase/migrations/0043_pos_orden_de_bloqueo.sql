-- =============================================================================
-- 0043 · Orden de bloqueo único en las operaciones del POS (sin deadlocks)
--
-- La prueba de carga (scripts/load) encontró interbloqueos con 32+ equipos:
--   · «abrir mesa» bloqueaba MESA → PEDIDO (al unir con el pedido abierto),
--   · «cobrar» bloqueaba PEDIDO → MESA (al liberarla).
-- Ahora toda operación sobre un pedido bloquea primero su mesa y después el
-- pedido, igual que «abrir mesa». Las ventas descuentan insumos en orden de id
-- (dos ventas de la misma sucursal ya no se cruzan en inventory_stock).
-- =============================================================================
create or replace function app.pos_open_order(p_tenant uuid, p_id uuid) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  o       orders;
  v_id    uuid := coalesce((select to_id from order_redirects where from_id = p_id and tenant_id = p_tenant), p_id);
  v_table uuid;
begin
  -- 1) La mesa (si es pedido de mesa). Se relee por si el pedido cambió de mesa
  --    mientras esperábamos el bloqueo.
  loop
    select table_id into v_table from orders where id = v_id and tenant_id = p_tenant;
    exit when v_table is null;
    perform 1 from restaurant_tables where id = v_table for update;
    exit when (select table_id from orders where id = v_id) is not distinct from v_table;
  end loop;
  -- 2) El pedido.
  select * into o from orders where tenant_id = p_tenant and id = v_id for update;
  if not found then
    raise exception 'El pedido ya no existe.' using errcode = 'P0001';
  end if;
  if o.status in ('cobrada', 'anulada') then
    raise exception 'El pedido ya fue % en otro dispositivo.', case o.status when 'cobrada' then 'cobrado' else 'anulado' end
      using errcode = 'P0001';
  end if;
  return o;
end $$;

create or replace function app.pos_deduct_inventory(o orders) returns void
language sql security definer set search_path = public, app as $$
  insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, order_id, actor)
  select o.tenant_id, o.branch_id, x.inventory_id, x.qty, 'venta', o.id, 'Venta'
  from (
    select r.inventory_id, -round(sum(r.qty_per_unit * ol.qty), 3) as qty
    from order_lines ol
    join recipes r on r.menu_item_id = ol.menu_item_id and r.tenant_id = o.tenant_id
    where ol.order_id = o.id
    group by r.inventory_id
  ) x
  order by x.inventory_id
  on conflict (order_id, item_id) where reason = 'venta' do nothing;
$$;
