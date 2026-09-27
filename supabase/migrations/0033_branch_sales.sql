-- Ventas por sucursal agregadas en la base (antes: el cliente bajaba hasta 2000
-- pedidos y sumaba; con más ventas el resultado quedaba corto e iba lento).
-- Usa el índice parcial orders_paid_idx (tenant_id, closed_at) where cobrada.
create or replace function public.branch_sales(p_tenant uuid, p_from timestamptz default null)
returns table (branch_id uuid, sales numeric, orders int)
language sql stable security definer set search_path = public, app as $$
  select o.branch_id, round(coalesce(sum(o.paid_total), 0), 2), count(*)::int
  from orders o
  where app.pos_member(p_tenant)
    and o.tenant_id = p_tenant
    and o.status = 'cobrada'
    and (p_from is null or o.closed_at >= p_from)
  group by o.branch_id;
$$;

grant execute on function public.branch_sales(uuid, timestamptz) to authenticated;
