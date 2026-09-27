-- =============================================================================
-- 0044 · Enterprise con locales incluidos + precio por local adicional
--   Enterprise: S/ 899 incluye 25 locales (principal + 24 sucursales); cada
--   sucursal activa adicional suma S/ 29 al mes. Sin tope de sucursales.
--   (Ver PRECIOS.md: una cadena grande consume soporte por local.)
--   · subscription_plans.included_branches / extra_branch_price
--   · app.plan_monthly_total(tenant): precio + adicionales (IGV incluido)
--   · v_tenants.plan_total y mrr con los adicionales
--   · branch_quota informa incluidos, adicionales y su precio
-- =============================================================================
alter table subscription_plans add column if not exists included_branches int;
alter table subscription_plans add column if not exists extra_branch_price numeric(10,2);

update subscription_plans set
  included_branches = 24,
  extra_branch_price = 29,
  max_branches = null,
  features = 'Todo lo del Pro para cadenas: 25 locales incluidos y S/ 29 por local adicional'
where tier = 'Enterprise';

-- Sucursales activas por encima de las incluidas en el plan.
create or replace function app.plan_extra_branches(p_tenant uuid) returns int
language sql stable security definer set search_path = public, app as $$
  select coalesce(greatest(app.active_child_branches(p_tenant) - p.included_branches, 0), 0)
  from tenants t join subscription_plans p on p.tier = t.plan
  where t.id = p_tenant and p.included_branches is not null and p.extra_branch_price is not null;
$$;

-- Total mensual con IGV: precio del plan + sucursales adicionales.
create or replace function app.plan_monthly_total(p_tenant uuid) returns numeric
language sql stable security definer set search_path = public, app as $$
  select round(p.price + coalesce(app.plan_extra_branches(t.id), 0) * coalesce(p.extra_branch_price, 0), 2)
  from tenants t join subscription_plans p on p.tier = t.plan
  where t.id = p_tenant;
$$;

drop view if exists v_tenants;
create view v_tenants with (security_invoker = true) as
select
  t.*,
  coalesce(app.plan_monthly_total(t.id), 0)::numeric(10,2) as plan_total,
  case when t.status = 'Activo' then coalesce(app.plan_monthly_total(t.id), 0) else 0 end::numeric(10,2) as mrr,
  (select count(*)::int from branches b where b.tenant_id = t.id and b.active) as branches_count
from tenants t;
grant select on v_tenants to authenticated;

create or replace function public.branch_quota(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  p      subscription_plans;
  v_used int;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  select sp.* into p from tenants t join subscription_plans sp on sp.tier = t.plan where t.id = p_tenant;
  v_used := app.active_child_branches(p_tenant);
  return jsonb_build_object(
    'plan', p.tier,
    'max', p.max_branches,
    'used', v_used,
    'remaining', case when p.max_branches is null then null else greatest(p.max_branches - v_used, 0) end,
    'included', p.included_branches,
    'extra_price', p.extra_branch_price,
    'extra', coalesce(app.plan_extra_branches(p_tenant), 0),
    'monthly_total', app.plan_monthly_total(p_tenant)
  );
end $$;
grant execute on function public.branch_quota(uuid) to authenticated;
