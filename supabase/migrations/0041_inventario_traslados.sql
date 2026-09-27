-- =============================================================================
-- 0041 · Inventario: compras, mermas y traslados entre sucursales
--   · Cada movimiento puede llevar una nota y una referencia (ref_id) que une
--     las dos patas de un traslado (salida en el origen, entrada en el destino).
--   · Nueva operación POS `inventory.transfer` (funciona sin conexión: se
--     encola en el equipo y se aplica una sola vez al sincronizar).
-- =============================================================================
alter table inventory_movements add column if not exists ref_id uuid;
alter table inventory_movements add column if not exists note text not null default '';
create index if not exists inventory_movements_ref_idx on inventory_movements (ref_id) where ref_id is not null;
-- Un traslado mueve cada insumo una sola vez por sucursal (reintentos idempotentes).
create unique index if not exists inventory_movements_transfer_once
  on inventory_movements (ref_id, branch_id, item_id) where reason = 'traslado';

alter function app.pos_exec(uuid, jsonb) rename to pos_exec_cash;

create or replace function app.pos_exec(p_tenant uuid, op jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_type   text := op ->> 'type';
  v_at     timestamptz := least(coalesce((op ->> 'at')::timestamptz, now()), now());
  v_actor  text := coalesce(nullif(op ->> 'actor', ''), 'POS');
  v_ref    uuid;
  v_from   uuid;
  v_to     uuid;
  v_qty    numeric;
  v_item   inventory_items;
  v_names  text[];
begin
  if v_type <> 'inventory.transfer' then
    return app.pos_exec_cash(p_tenant, op);
  end if;

  if not ((select app.is_platform_admin()) or p_tenant = any ((select app.my_managed_tenant_ids())::uuid[])) then
    raise exception 'Solo gerencia puede trasladar inventario.' using errcode = 'P0001';
  end if;
  v_ref := (op ->> 'transfer_id')::uuid;
  if exists (select 1 from inventory_movements where ref_id = v_ref and reason = 'traslado') then
    return '{}'::jsonb; -- reintento
  end if;
  select * into v_item from inventory_items where id = (op ->> 'item_id')::uuid and tenant_id = p_tenant;
  if not found then
    raise exception 'El insumo ya no existe.' using errcode = 'P0001';
  end if;
  select id into v_from from branches where id = (op ->> 'from_branch_id')::uuid and tenant_id = p_tenant;
  select id into v_to   from branches where id = (op ->> 'to_branch_id')::uuid and tenant_id = p_tenant;
  if v_from is null or v_to is null then
    raise exception 'Elige sucursales de origen y destino válidas.' using errcode = 'P0001';
  end if;
  if v_from = v_to then
    raise exception 'El origen y el destino deben ser sucursales distintas.' using errcode = 'P0001';
  end if;
  v_qty := round((op ->> 'qty')::numeric, 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'La cantidad a trasladar debe ser mayor que cero.' using errcode = 'P0001';
  end if;

  insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor, created_at, ref_id, note)
  values (p_tenant, v_from, v_item.id, -v_qty, 'traslado', v_actor, v_at, v_ref, coalesce(op ->> 'note', '')),
         (p_tenant, v_to,   v_item.id,  v_qty, 'traslado', v_actor, v_at, v_ref, coalesce(op ->> 'note', ''));

  select array_agg(name order by case when id = v_from then 0 else 1 end) into v_names
  from branches where id in (v_from, v_to);
  perform app.pos_log(p_tenant, v_actor,
    format('Trasladó %s %s de %s de %s a %s', v_qty, v_item.unit, v_item.name, v_names[1], v_names[2]));
  return '{}'::jsonb;
end $$;

-- Kardex legible para la app (últimos movimientos con nombre de sucursal e insumo).
create or replace view public.inventory_kardex with (security_invoker = true) as
select m.id, m.tenant_id, m.branch_id, b.name as branch_name, m.item_id, i.name as item_name, i.unit,
       m.delta, m.reason, m.actor, m.note, m.ref_id, m.created_at
from inventory_movements m
join branches b on b.id = m.branch_id
join inventory_items i on i.id = m.item_id;
grant select on public.inventory_kardex to authenticated;
