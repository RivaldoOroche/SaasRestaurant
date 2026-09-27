-- =============================================================================
-- 0045 · Planes pensados para la realidad peruana: casi todos los restaurantes
-- tienen un solo local y muy pocos pasan de 4 (ver PRECIOS.md).
--   Básico      S/ 159  · 1 local (sin sucursales)
--   Pro         S/ 299  · 2 locales incluidos + S/ 119 por local adicional, hasta 5
--   Enterprise  S/ 899  · 6 locales incluidos + S/  99 por local adicional, sin tope
-- Precios con IGV. Anual = 10 meses del precio base.
-- Los restaurantes que ya tenían sucursales en Básico las conservan (no se
-- desactiva nada); solo no pueden agregar nuevas sin pasar a Pro.
-- =============================================================================
insert into subscription_plans (tier, price, annual_price, max_branches, included_branches, extra_branch_price, features) values
  ('Básico', 159, 1590, 0, null, null,
   'Todo para un local: POS, cocina, caja, delivery, inventario, recetas, reportes y comprobantes SUNAT (Wayra no cobra por comprobante)'),
  ('Pro', 299, 2990, 4, 1, 119,
   'Todo lo del Básico para 2 locales (hasta 5): reportes consolidados, traslados de insumos y personal por local'),
  ('Enterprise', 899, 8990, null, 5, 99,
   'Para cadenas: 6 locales incluidos, S/ 99 por local adicional y asesor dedicado')
on conflict (tier) do update set
  price = excluded.price,
  annual_price = excluded.annual_price,
  max_branches = excluded.max_branches,
  included_branches = excluded.included_branches,
  extra_branch_price = excluded.extra_branch_price,
  features = excluded.features;

-- Mensajes claros al llegar al tope (mismos textos que lib/plans.ts).
create or replace function app.plan_limit_message(p_plan plan_tier, p_max int) returns text
language sql immutable as $$
  select case
    when p_max = 0 then format('Tu plan %s es para un solo local. Pasa al plan Pro para agregar sucursales.', p_plan)
    else format('Tu plan %s permite hasta %s locales (la sede principal y %s sucursales). Mejora tu plan para agregar más.',
                p_plan, p_max + 1, p_max)
  end;
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
    raise exception '%', app.plan_limit_message(v_plan, v_max) using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;

create or replace function app.tenants_plan_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_max  int := app.plan_max_branches(new.plan);
  v_used int;
begin
  if new.plan is distinct from old.plan and v_max is not null then
    v_used := app.active_child_branches(new.id);
    if v_used > v_max then
      raise exception 'El plan % permite % y el restaurante tiene % sucursales activas. Desactiva % antes de cambiar de plan.',
        new.plan,
        case when v_max = 0 then 'un solo local' else format('hasta %s sucursales', v_max) end,
        v_used, v_used - v_max
        using errcode = 'P0001', hint = 'plan_limit';
    end if;
  end if;
  return new;
end $$;
