-- ============================================================================
-- Wayra POS — datos de prueba (seed) para un proyecto Supabase nuevo.
-- Ejecuta este archivo UNA VEZ, después de aplicar todas las migraciones
-- (supabase/migrations). Es idempotente donde hay claves únicas; para volver a
-- sembrar desde cero, mejor recrea la base (o borra los datos del tenant demo).
--
-- Los usuarios de Auth NO se pueden crear por SQL: créalos en el dashboard
-- (Authentication → Users) y luego inserta sus `memberships` (ver la sección
-- final de este archivo y SUPABASE_SETUP.md).
-- ============================================================================

-- IDs fijos para poder referenciarlos entre tablas.
--   Tenant demo:            11111111-1111-1111-1111-111111111111
--   Sucursal Miraflores:    22222222-0000-0000-0000-000000000001
--   Sucursal San Isidro:    22222222-0000-0000-0000-000000000002

-- ---------------------------------------------------------------------------
-- 1) Planes de suscripción
-- ---------------------------------------------------------------------------
-- max_branches = sucursales además de la sede principal (null = sin límite).
-- Casi todos los restaurantes tienen un local: Básico = 1 local; Pro = 2 incluidos
-- (+ S/ 119 c/u, hasta 5); Enterprise = 6 incluidos (+ S/ 99 c/u, sin tope).
insert into subscription_plans (tier, price, features, max_branches, annual_price, included_branches, extra_branch_price) values
  ('Básico', 159, 'Todo para un local: POS, cocina, caja, delivery, inventario, recetas, reportes y comprobantes SUNAT (Wayra no cobra por comprobante)', 0, 1590, null, null),
  ('Pro', 299, 'Todo lo del Básico para 2 locales (hasta 5): reportes consolidados, traslados de insumos y personal por local', 4, 2990, 1, 119),
  ('Enterprise', 899, 'Para cadenas: 6 locales incluidos, S/ 99 por local adicional y asesor dedicado', null, 8990, 5, 99)
on conflict (tier) do update set
  price = excluded.price, features = excluded.features, max_branches = excluded.max_branches,
  annual_price = excluded.annual_price, included_branches = excluded.included_branches,
  extra_branch_price = excluded.extra_branch_price;

-- ---------------------------------------------------------------------------
-- 2) Datos del emisor del SaaS (tu empresa)
-- ---------------------------------------------------------------------------
insert into platform_settings (id, razon_social, ruc, direccion, billing_email)
values (true, 'Wayra POS S.A.C.', '20601234567', 'Av. Javier Prado 1234, San Isidro, Lima', 'facturacion@wayrapos.pe')
on conflict (id) do update set
  razon_social = excluded.razon_social, ruc = excluded.ruc,
  direccion = excluded.direccion, billing_email = excluded.billing_email;

-- ---------------------------------------------------------------------------
-- 3) Tenants (el demo + otros para poblar la consola SaaS)
-- ---------------------------------------------------------------------------
-- Cada alta crea sola su sede principal (trigger tenants_create_root). El MRR
-- no se guarda: se deriva del plan en la vista v_tenants.
insert into tenants (id, name, slug, owner_name, plan, status, since) values
  ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'la-higuera', 'Mónica R.', 'Pro', 'Activo', '2025-03-01'),
  ('a0000000-0000-0000-0000-000000000002', 'Cevichería El Muelle', 'cevicheria-el-muelle', 'Andrés Ríos', 'Enterprise', 'Activo', '2024-06-01'),
  ('a0000000-0000-0000-0000-000000000003', 'Sushi Nami', 'sushi-nami', 'Keiko Tanaka', 'Pro', 'Activo', '2025-11-01'),
  ('a0000000-0000-0000-0000-000000000004', 'Tacos El Farol', 'tacos-el-farol', 'Raúl Méndez', 'Básico', 'Activo', '2025-01-01'),
  ('a0000000-0000-0000-0000-000000000005', 'Café Aurora', 'cafe-aurora', 'Paula Vega', 'Pro', 'Prueba', '2026-02-01'),
  ('a0000000-0000-0000-0000-000000000006', 'Brasas del Sur', 'brasas-del-sur', 'Jorge Salas', 'Básico', 'Suspendido', '2025-09-01')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Configuración del negocio del tenant demo
-- ---------------------------------------------------------------------------
insert into business_settings
  (tenant_id, name, currency, tax_rate, ruc, address, razon_social, ubigeo,
   yape_number, plin_number, card_provider, billing_provider, sunat_mode)
values
  ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'PEN', 18,
   '20512345678', 'Av. La Mar 1234, Miraflores, Lima', 'LA HIGUERA S.A.C.', '150122',
   '987 654 321', '987 654 321', 'ninguno', 'ninguno', 'beta')
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5) Sucursales del tenant demo (árbol: Miraflores es la sede principal y
--    San Isidro depende de ella). IDs fijos para asignar mesas.
-- ---------------------------------------------------------------------------
update branches
set id = '22222222-0000-0000-0000-000000000001', name = 'Miraflores', city = 'Lima',
    address = 'Av. La Mar 1234, Miraflores'
where tenant_id = '11111111-1111-1111-1111-111111111111' and parent_id is null
  and id <> '22222222-0000-0000-0000-000000000001';
insert into branches (id, tenant_id, parent_id, name, city, address) values
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '22222222-0000-0000-0000-000000000001', 'San Isidro', 'Lima', 'Calle Las Begonias 450, San Isidro')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6) Personal (staff). El PIN se define desde la app (se guarda hasheado).
-- ---------------------------------------------------------------------------
insert into staff_members (tenant_id, name, initials, role) values
  ('11111111-1111-1111-1111-111111111111', 'Mónica R.', 'MR', 'dueno'),
  ('11111111-1111-1111-1111-111111111111', 'Iker Solís', 'IS', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'Ana Ruiz', 'AR', 'mesero'),
  ('11111111-1111-1111-1111-111111111111', 'Carlos Vega', 'CV', 'mesero')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7) Carta: categorías + platos
-- ---------------------------------------------------------------------------
insert into menu_categories (tenant_id, key, name, icon, subtitle, sort) values
  ('11111111-1111-1111-1111-111111111111', 'entradas', 'Entradas', '🥑', 'Para empezar a compartir', 1),
  ('11111111-1111-1111-1111-111111111111', 'ceviches', 'Ceviches', '🐟', 'Frescos del día', 2),
  ('11111111-1111-1111-1111-111111111111', 'segundos', 'Segundos', '🍲', 'Criollos de la casa', 3),
  ('11111111-1111-1111-1111-111111111111', 'postres', 'Postres', '🍮', 'Dulces limeños', 4),
  ('11111111-1111-1111-1111-111111111111', 'bebidas', 'Barra', '🍹', 'Piscos y refrescos', 5)
on conflict do nothing;

insert into menu_items (tenant_id, category_id, name, description, price, emoji, badge, is_spicy, is_gf, is_meat, sort)
select '11111111-1111-1111-1111-111111111111', c.id, v.name, v.descr, v.price, v.emoji, v.badge, v.spicy, v.gf, v.meat, v.sort
from (values
  ('entradas', 'Causa limeña', 'Papa amarilla, palta, pollo', 28.0, '🥔', null, false, true, false, 1),
  ('entradas', 'Anticuchos', 'Corazón de res a la parrilla, papa dorada', 34.0, '🍢', null, true, true, true, 2),
  ('ceviches', 'Ceviche clásico', 'Pescado fresco, limón, ají limo, camote', 42.0, '🐟', 'Popular', true, true, false, 1),
  ('ceviches', 'Tiradito nikkei', 'Láminas de pescado, crema de rocoto', 46.0, '🐟', null, true, true, false, 2),
  ('segundos', 'Lomo saltado', 'Lomo de res, cebolla, tomate, papas fritas', 48.0, '🥩', 'Chef', false, false, true, 1),
  ('segundos', 'Ají de gallina', 'Gallina deshilachada en crema de ají amarillo', 38.0, '🍗', null, true, true, false, 2),
  ('postres', 'Suspiro a la limeña', 'Manjar blanco y merengue al oporto', 22.0, '🍮', null, false, true, false, 1),
  ('bebidas', 'Pisco sour', 'Pisco quebranta, limón, clara de huevo', 26.0, '🍸', 'Popular', false, true, false, 1),
  ('bebidas', 'Chicha morada', 'Maíz morado, piña, canela y clavo', 14.0, '🟣', null, false, true, false, 2)
) as v(catkey, name, descr, price, emoji, badge, spicy, gf, meat, sort)
join menu_categories c on c.key = v.catkey and c.tenant_id = '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

-- Modificadores (extras y preferencias)
insert into modifier_extras (tenant_id, key, name, price) values
  ('11111111-1111-1111-1111-111111111111', 'extra-camote', 'Camote extra', 5),
  ('11111111-1111-1111-1111-111111111111', 'extra-choclo', 'Choclo extra', 4),
  ('11111111-1111-1111-1111-111111111111', 'doble-pisco', 'Doble de pisco', 8)
on conflict do nothing;
insert into modifier_prefs (tenant_id, key, name) values
  ('11111111-1111-1111-1111-111111111111', 'sin-cebolla', 'Sin cebolla'),
  ('11111111-1111-1111-1111-111111111111', 'sin-aji', 'Sin ají'),
  ('11111111-1111-1111-1111-111111111111', 'termino-medio', 'Término medio')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8) Mesas — 1..12 en Miraflores, 13..20 en San Isidro
-- ---------------------------------------------------------------------------
insert into restaurant_tables (tenant_id, branch_id, zone, number, seats, status)
select
  '11111111-1111-1111-1111-111111111111',
  case when n <= 12 then '22222222-0000-0000-0000-000000000001'::uuid
       else '22222222-0000-0000-0000-000000000002'::uuid end,
  z.zone, n, case when z.zone = 'Barra' then 2 else 4 end, 'libre'
from (values ('Terraza', 1, 6), ('Salón principal', 7, 16), ('Barra', 17, 20)) as z(zone, lo, hi)
cross join lateral generate_series(z.lo, z.hi) as n
on conflict (branch_id, number) do nothing;

-- ---------------------------------------------------------------------------
-- 9) Inventario (con costo por unidad para food cost)
-- ---------------------------------------------------------------------------
-- Catálogo de insumos (compartido por todas las sucursales) + stock inicial de
-- cada sucursal como movimiento de kardex (el stock es la suma de movimientos).
insert into inventory_items (tenant_id, name, unit, par, cost) values
  ('11111111-1111-1111-1111-111111111111', 'Pescado fresco', 'kg', 20, 28.00),
  ('11111111-1111-1111-1111-111111111111', 'Lomo de res', 'kg', 12, 32.00),
  ('11111111-1111-1111-1111-111111111111', 'Papa amarilla', 'kg', 25, 3.50),
  ('11111111-1111-1111-1111-111111111111', 'Ají amarillo', 'kg', 8, 9.00),
  ('11111111-1111-1111-1111-111111111111', 'Culantro', 'atado', 10, 1.50),
  ('11111111-1111-1111-1111-111111111111', 'Pisco', 'bot', 6, 45.00),
  ('11111111-1111-1111-1111-111111111111', 'Limón', 'kg', 15, 5.00)
on conflict do nothing;

insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor)
select '11111111-1111-1111-1111-111111111111', b.branch_id, inv.id, v.qty * b.factor, 'inicial', 'Seed'
from (values
  ('Pescado fresco', 18), ('Lomo de res', 15), ('Papa amarilla', 40), ('Ají amarillo', 6),
  ('Culantro', 8), ('Pisco', 12), ('Limón', 22)
) as v(insumo, qty)
join inventory_items inv on inv.name = v.insumo and inv.tenant_id = '11111111-1111-1111-1111-111111111111'
cross join (values
  ('22222222-0000-0000-0000-000000000001'::uuid, 1.0),
  ('22222222-0000-0000-0000-000000000002'::uuid, 0.5)
) as b(branch_id, factor)
where not exists (select 1 from inventory_movements m where m.item_id = inv.id);

-- ---------------------------------------------------------------------------
-- 10) Recetas (food cost) — enlaza plato ↔ insumo por nombre
-- ---------------------------------------------------------------------------
insert into recipes (tenant_id, menu_item_id, inventory_id, qty_per_unit)
select '11111111-1111-1111-1111-111111111111', mi.id, inv.id, r.qty
from (values
  ('Ceviche clásico', 'Pescado fresco', 0.25),
  ('Ceviche clásico', 'Limón', 0.10),
  ('Ceviche clásico', 'Culantro', 0.05),
  ('Tiradito nikkei', 'Pescado fresco', 0.20),
  ('Tiradito nikkei', 'Ají amarillo', 0.03),
  ('Lomo saltado', 'Lomo de res', 0.30),
  ('Lomo saltado', 'Papa amarilla', 0.20),
  ('Ají de gallina', 'Ají amarillo', 0.06),
  ('Causa limeña', 'Papa amarilla', 0.25),
  ('Pisco sour', 'Pisco', 0.08),
  ('Pisco sour', 'Limón', 0.05)
) as r(plato, insumo, qty)
join menu_items mi on mi.name = r.plato and mi.tenant_id = '11111111-1111-1111-1111-111111111111'
join inventory_items inv on inv.name = r.insumo and inv.tenant_id = '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 11) CRM (clientes de lealtad)
-- ---------------------------------------------------------------------------
insert into customers (tenant_id, name, phone, visits, spent, points, tier) values
  ('11111111-1111-1111-1111-111111111111', 'Lucía Fernández', '987 654 321', 14, 1820, 182, 'Oro'),
  ('11111111-1111-1111-1111-111111111111', 'Diego Rojas', '956 112 233', 6, 640, 64, 'Plata'),
  ('11111111-1111-1111-1111-111111111111', 'Valeria Chávez', '999 888 777', 2, 180, 18, 'Bronce')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 12) Consola SaaS: facturas, tickets y bitácora de plataforma
-- ---------------------------------------------------------------------------
insert into saas_invoices (tenant_id, folio, amount, igv, method, paid) values
  ('11111111-1111-1111-1111-111111111111', 'NP-F001-1001', 1499, 228.66, 'tarjeta', true),
  ('a0000000-0000-0000-0000-000000000002', 'NP-F001-1002', 4800, 732.20, 'tarjeta', true),
  ('a0000000-0000-0000-0000-000000000003', 'NP-F001-1003', 1499, 228.66, 'transferencia', true),
  ('a0000000-0000-0000-0000-000000000004', 'NP-F001-1004', 699, 106.63, 'tarjeta', true),
  ('a0000000-0000-0000-0000-000000000006', 'NP-F001-1005', 699, 106.63, 'tarjeta', false)
on conflict do nothing;

insert into support_tickets (tenant_id, subject, priority, status) values
  ('a0000000-0000-0000-0000-000000000003', 'Impresora no responde', 'Alta', 'Abierto'),
  ('a0000000-0000-0000-0000-000000000002', 'Duda sobre reportes por mesero', 'Media', 'Abierto'),
  ('a0000000-0000-0000-0000-000000000004', 'Solicitud de nueva sucursal', 'Baja', 'Abierto'),
  ('11111111-1111-1111-1111-111111111111', 'Capacitación de personal', 'Baja', 'Resuelto')
on conflict do nothing;

insert into platform_activity (actor, message) values
  ('Plataforma', 'Tenant Café Aurora creado · plan Pro (prueba 14 días)'),
  ('Plataforma', 'Suscripción de Brasas del Sur suspendida por falta de pago'),
  ('Plataforma', 'Plan Pro actualizado (precio S/ 1499)')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 13) Comprobantes de ejemplo (para que el Monitor SUNAT no salga vacío)
-- ---------------------------------------------------------------------------
insert into comprobantes (tenant_id, folio, tipo, buyer_ruc, buyer_name, subtotal, igv, total, reference, status)
values
  ('11111111-1111-1111-1111-111111111111', 'B001-1001', 'Boleta', null, 'CLIENTES VARIOS', 40.00, 7.20, 47.20, 'Mesa 7', 'aceptada'),
  ('11111111-1111-1111-1111-111111111111', 'F001-1001', 'Factura', '20512345678', 'CONTOSO SAC', 180.00, 32.40, 212.40, 'Mesa 3', 'aceptada')
on conflict do nothing;

-- Contadores de folio coherentes con los comprobantes de ejemplo.
insert into folio_counters (tenant_id, serie, last) values
  ('11111111-1111-1111-1111-111111111111', 'B001', 1001),
  ('11111111-1111-1111-1111-111111111111', 'F001', 1001)
on conflict (tenant_id, serie) do nothing;

-- ============================================================================
-- 14) Cuentas de acceso (se hace en el dashboard, NO por SQL)
-- ----------------------------------------------------------------------------
-- 1. Authentication → Users → Add user (email + password) para:
--      - el dueño de la plataforma (tú, SaaS)
--      - el dueño del tenant demo (Mónica / La Higuera)
-- 2. Copia el UUID de cada usuario y ejecuta:
--
--   -- Dueño de la plataforma (ve la consola SaaS):
--   insert into memberships (user_id, tenant_id, role)
--   values ('<uid-plataforma>', null, 'saas');
--
--   -- Dueño del tenant demo (ve el POS de La Higuera):
--   insert into memberships (user_id, tenant_id, role)
--   values ('<uid-monica>', '11111111-1111-1111-1111-111111111111', 'dueno');
--
-- El staff (Gerente/Mesero) entra por PIN en el dispositivo del local; sus PIN
-- se definen desde Dueño → Personal (se guardan hasheados).
-- ============================================================================
