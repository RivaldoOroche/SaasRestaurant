-- Demo seed for NubePOS (Peruvian context). Reference data + one demo tenant's
-- catalog. Auth users can't be created from SQL, so create them in the Supabase
-- dashboard (Auth), then insert matching `memberships` rows (see APP_SETUP.md).

-- Subscription plans (prices in soles, monthly).
insert into subscription_plans (tier, price, features) values
  ('Básico', 699, 'POS + 1 sucursal'),
  ('Pro', 1499, 'POS + inventario + reportes + 3 sucursales'),
  ('Enterprise', 4800, 'Todo + multi-sucursal ilimitado + soporte')
on conflict (tier) do nothing;

-- Demo tenant: La Higuera (Mónica), Miraflores, Lima.
insert into tenants (id, name, slug, owner_name, plan, mrr, status, since)
values ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'la-higuera',
        'Mónica R.', 'Pro', 1499, 'Activo', '2025-03-01')
on conflict (id) do nothing;

insert into business_settings (tenant_id, name, currency, tax_rate, ruc, address)
values ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'PEN', 18,
        '20512345678', 'Av. La Mar 1234, Miraflores, Lima')
on conflict (tenant_id) do nothing;

insert into branches (tenant_id, name, city) values
  ('11111111-1111-1111-1111-111111111111', 'Miraflores', 'Lima'),
  ('11111111-1111-1111-1111-111111111111', 'San Isidro', 'Lima'),
  ('11111111-1111-1111-1111-111111111111', 'Arequipa Centro', 'Arequipa')
on conflict do nothing;

-- Staff (PINs must be hashed by the app; left null here — see APP_SETUP.md).
insert into staff_members (tenant_id, name, initials, role) values
  ('11111111-1111-1111-1111-111111111111', 'Mónica R.', 'MR', 'dueno'),
  ('11111111-1111-1111-1111-111111111111', 'Iker Solís', 'IS', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'Ana Ruiz', 'AR', 'mesero'),
  ('11111111-1111-1111-1111-111111111111', 'Carlos Vega', 'CV', 'mesero')
on conflict do nothing;

-- Menu categories (Peruvian).
insert into menu_categories (tenant_id, key, name, icon, subtitle, sort) values
  ('11111111-1111-1111-1111-111111111111', 'entradas', 'Entradas', '🥑', 'Para empezar a compartir', 1),
  ('11111111-1111-1111-1111-111111111111', 'ceviches', 'Ceviches', '🐟', 'Frescos del día', 2),
  ('11111111-1111-1111-1111-111111111111', 'segundos', 'Segundos', '🍲', 'Criollos de la casa', 3),
  ('11111111-1111-1111-1111-111111111111', 'postres', 'Postres', '🍮', 'Dulces limeños', 4),
  ('11111111-1111-1111-1111-111111111111', 'bebidas', 'Barra', '🍹', 'Piscos y refrescos', 5)
on conflict do nothing;

-- A few representative menu items (full catalog is a data task for Phase 5).
insert into menu_items (tenant_id, category_id, name, description, price, emoji, badge, is_spicy, is_gf, is_meat)
select '11111111-1111-1111-1111-111111111111', c.id, v.name, v.descr, v.price, v.emoji, v.badge, v.spicy, v.gf, v.meat
from (values
  ('ceviches', 'Ceviche clásico', 'Pescado fresco, limón, ají limo, camote', 42.0, '🐟', 'Popular', true, true, false),
  ('ceviches', 'Tiradito nikkei', 'Láminas de pescado, crema de rocoto', 46.0, '🐟', null, true, true, false),
  ('segundos', 'Lomo saltado', 'Lomo de res, cebolla, tomate, papas fritas', 48.0, '🥩', 'Chef', false, false, true),
  ('segundos', 'Ají de gallina', 'Gallina deshilachada en crema de ají amarillo', 38.0, '🍗', null, true, true, false),
  ('entradas', 'Causa limeña', 'Papa amarilla, palta, pollo', 28.0, '🥔', null, false, true, false),
  ('entradas', 'Anticuchos', 'Corazón de res a la parrilla, papa dorada', 34.0, '🍢', null, true, true, true),
  ('postres', 'Suspiro a la limeña', 'Manjar blanco y merengue al oporto', 22.0, '🍮', null, false, true, false),
  ('bebidas', 'Pisco sour', 'Pisco quebranta, limón, clara de huevo', 26.0, '🍸', 'Popular', false, true, false),
  ('bebidas', 'Chicha morada', 'Maíz morado, piña, canela y clavo', 14.0, '🟣', null, false, true, false)
) as v(catkey, name, descr, price, emoji, badge, spicy, gf, meat)
join menu_categories c on c.key = v.catkey and c.tenant_id = '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

-- Tables across zones.
insert into restaurant_tables (tenant_id, zone, number, seats, status)
select '11111111-1111-1111-1111-111111111111', z.zone, n, 4, 'libre'
from (values ('Terraza', 1, 6), ('Salón principal', 7, 16), ('Barra', 17, 20)) as z(zone, lo, hi)
cross join lateral generate_series(z.lo, z.hi) as n
on conflict do nothing;

-- Inventory (Peruvian ingredients).
insert into inventory_items (tenant_id, name, unit, stock, par) values
  ('11111111-1111-1111-1111-111111111111', 'Pescado fresco', 'kg', 18, 20),
  ('11111111-1111-1111-1111-111111111111', 'Papa amarilla', 'kg', 40, 25),
  ('11111111-1111-1111-1111-111111111111', 'Ají amarillo', 'kg', 6, 8),
  ('11111111-1111-1111-1111-111111111111', 'Culantro', 'atado', 0, 10),
  ('11111111-1111-1111-1111-111111111111', 'Pisco', 'bot', 12, 6),
  ('11111111-1111-1111-1111-111111111111', 'Limón', 'kg', 22, 15)
on conflict do nothing;

-- Demo CRM customers.
insert into customers (tenant_id, name, phone, visits, spent, points, tier) values
  ('11111111-1111-1111-1111-111111111111', 'Lucía Fernández', '987 654 321', 14, 1820, 182, 'Oro'),
  ('11111111-1111-1111-1111-111111111111', 'Diego Rojas', '956 112 233', 6, 640, 64, 'Plata'),
  ('11111111-1111-1111-1111-111111111111', 'Valeria Chávez', '999 888 777', 2, 180, 18, 'Bronce')
on conflict do nothing;
