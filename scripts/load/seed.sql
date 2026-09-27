-- Datos para la prueba de carga: :n restaurantes (plan Pro), cada uno con
-- sede principal + 1 sucursal, 20 mesas por local, carta de 30 platos con
-- receta, 12 insumos con stock y un mesero con cuenta.
-- Uso: psql -v n=300 -f scripts/load/seed.sql
\set ON_ERROR_STOP 1
drop table if exists load_ctx;
create table load_ctx (
  i        int primary key,
  tenant   uuid not null,
  usr      uuid not null,
  branch   uuid not null,
  tables   uuid[] not null,
  items    uuid[] not null,
  prices   numeric[] not null
);

select set_config('load.n', :'n', false);

do $$
declare
  n      int := current_setting('load.n')::int;
  k      int;
  t      uuid;
  b1     uuid;
  b2     uuid;
  u      uuid;
  cat    uuid;
begin
  for k in 1..n loop
    insert into tenants (name, slug, owner_name, plan, status)
    values ('Carga ' || k, 'carga-' || k || '-' || substr(md5(random()::text), 1, 6), 'Dueño ' || k, 'Pro', 'Activo')
    returning id into t;
    b1 := app.root_branch(t);
    insert into branches (tenant_id, parent_id, name, city) values (t, b1, 'Sucursal ' || k, 'Lima') returning id into b2;

    insert into restaurant_tables (tenant_id, branch_id, zone, number, seats, status)
    select t, br, 'Salón', g, 4, 'libre' from unnest(array[b1, b2]) br, generate_series(1, 20) g;

    insert into menu_categories (tenant_id, key, name, icon, subtitle, sort)
    values (t, 'general', 'Carta', '🍽️', '', 1) returning id into cat;
    insert into menu_items (tenant_id, category_id, name, description, price, emoji, sort)
    select t, cat, 'Plato ' || g, '', 18 + (g % 7) * 6, '🍽️', g from generate_series(1, 30) g;

    insert into inventory_items (tenant_id, name, unit, par, cost)
    select t, 'Insumo ' || g, 'kg', 20, 5 + g from generate_series(1, 12) g;
    insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor)
    select t, br, i.id, 100000, 'inicial', 'Carga'
    from inventory_items i, unnest(array[b1, b2]) br where i.tenant_id = t;
    -- Cada plato consume 2 insumos.
    insert into recipes (tenant_id, menu_item_id, inventory_id, qty_per_unit)
    select t, mi.id, ii.id, 0.1
    from menu_items mi
    join inventory_items ii on ii.tenant_id = t
     and ii.name in ('Insumo ' || (1 + mi.sort % 12), 'Insumo ' || (1 + (mi.sort + 5) % 12))
    where mi.tenant_id = t;

    insert into auth.users (email) values ('mesero' || k || '@carga.test') returning id into u;
    insert into memberships (user_id, tenant_id, role) values (u, t, 'mesero');

    -- Dos "equipos" por restaurante (uno por local) para repartir la carga.
    insert into load_ctx (i, tenant, usr, branch, tables, items, prices)
    select (k - 1) * 2 + x.o, t, u, x.br,
           (select array_agg(id order by number) from restaurant_tables where branch_id = x.br),
           (select array_agg(id order by sort) from menu_items where tenant_id = t),
           (select array_agg(price order by sort) from menu_items where tenant_id = t)
    from (values (1, b1), (2, b2)) x(o, br);
  end loop;
end $$;

analyze;
select count(*) as equipos, count(distinct tenant) as restaurantes from load_ctx;
