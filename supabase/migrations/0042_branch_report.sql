-- =============================================================================
-- 0042 · Reporte consolidado por sucursal (para sumar por rama del árbol)
--   Una fila por sucursal con ventas, medios de pago, costo de insumos
--   consumidos (kardex de ventas × costo actual), mermas, compras, traslados y
--   diferencias de caja en el rango. La app suma cada rama del árbol.
-- =============================================================================
create or replace function public.branch_report(p_tenant uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (
  branch_id      uuid,
  sales          numeric,
  orders         int,
  cash_sales     numeric,
  card_sales     numeric,
  digital_sales  numeric,
  food_cost      numeric,
  waste_cost     numeric,
  purchases      numeric,
  transfer_in    numeric,
  transfer_out   numeric,
  cash_diff      numeric
)
language sql stable security definer set search_path = public, app as $$
  with b as (
    select id from branches where tenant_id = p_tenant and app.pos_member(p_tenant)
  ),
  s as (
    select o.branch_id,
           sum(o.paid_total) sales, count(*)::int n,
           sum(o.paid_total) filter (where o.paid_method = 'efectivo') cash,
           sum(o.paid_total) filter (where o.paid_method = 'tarjeta')  card,
           sum(o.paid_total) filter (where o.paid_method not in ('efectivo', 'tarjeta')) digital
    from orders o
    where o.tenant_id = p_tenant and o.status = 'cobrada'
      and (p_from is null or o.closed_at >= p_from) and (p_to is null or o.closed_at < p_to)
    group by o.branch_id
  ),
  m as (
    select mv.branch_id,
           sum(-mv.delta * coalesce(i.cost, 0)) filter (where mv.reason = 'venta')                    food,
           sum(-mv.delta * coalesce(i.cost, 0)) filter (where mv.reason = 'merma')                    waste,
           sum( mv.delta * coalesce(i.cost, 0)) filter (where mv.reason = 'compra')                   buy,
           sum( mv.delta * coalesce(i.cost, 0)) filter (where mv.reason = 'traslado' and mv.delta > 0) tin,
           sum(-mv.delta * coalesce(i.cost, 0)) filter (where mv.reason = 'traslado' and mv.delta < 0) tout
    from inventory_movements mv
    join inventory_items i on i.id = mv.item_id
    where mv.tenant_id = p_tenant
      and (p_from is null or mv.created_at >= p_from) and (p_to is null or mv.created_at < p_to)
    group by mv.branch_id
  ),
  c as (
    select cs.branch_id, sum(cs.difference) diff
    from cash_sessions cs
    where cs.tenant_id = p_tenant and cs.status = 'cerrada'
      and (p_from is null or cs.closed_at >= p_from) and (p_to is null or cs.closed_at < p_to)
    group by cs.branch_id
  )
  select b.id,
         round(coalesce(s.sales, 0), 2), coalesce(s.n, 0),
         round(coalesce(s.cash, 0), 2), round(coalesce(s.card, 0), 2), round(coalesce(s.digital, 0), 2),
         round(coalesce(m.food, 0), 2), round(coalesce(m.waste, 0), 2), round(coalesce(m.buy, 0), 2),
         round(coalesce(m.tin, 0), 2), round(coalesce(m.tout, 0), 2),
         round(coalesce(c.diff, 0), 2)
  from b
  left join s on s.branch_id = b.id
  left join m on m.branch_id = b.id
  left join c on c.branch_id = b.id;
$$;

grant execute on function public.branch_report(uuid, timestamptz, timestamptz) to authenticated;
