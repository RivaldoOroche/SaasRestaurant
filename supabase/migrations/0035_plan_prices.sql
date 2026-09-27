-- Precios de los planes alineados al mercado peruano (2026). Precios finales
-- en soles con IGV incluido; todas las funciones en todos los planes, cambian
-- las sucursales permitidas y el soporte. annual_price = 10 meses (2 gratis).
alter table subscription_plans add column if not exists annual_price numeric(10,2);

insert into subscription_plans (tier, price, annual_price, max_branches, features) values
  ('Básico', 149, 1490, 2, 'Todas las funciones: POS, cocina, caja, delivery, inventario, recetas, reportes y comprobantes SUNAT'),
  ('Pro', 349, 3490, 10, 'Todo lo del Básico + reportes consolidados de todas tus sucursales'),
  ('Enterprise', 899, 8990, null, 'Todo lo del Pro para cadenas, sin límite de sucursales')
on conflict (tier) do update set
  price = excluded.price,
  annual_price = excluded.annual_price,
  max_branches = excluded.max_branches,
  features = excluded.features;
