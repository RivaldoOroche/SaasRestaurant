# Arquitectura de Wayra POS

Guía corta para quien mantenga el sistema: cómo se organizan los datos, cómo
funciona el modo sin conexión y dónde vive cada regla.

## 1. Multi-tenant y árbol de sucursales

- **Un restaurante = un tenant.** Todas las tablas del negocio llevan `tenant_id`
  y RLS impide ver o escribir datos de otro tenant.
- **Sucursales en árbol.** Cada tenant tiene una sola **sede principal**
  (`branches.parent_id is null`), creada sola al dar de alta el tenant
  (trigger `tenants_create_root`). Las sucursales cuelgan de ella o de otra
  sucursal (hasta 5 niveles). Reglas en la base:
  - sin ciclos y la principal no puede depender de nadie (`branches_tree_guard`);
  - la principal nunca se borra; una sucursal con hijas, mesas o ventas
    tampoco: se **desactiva** (`branches_delete_guard`).
- **Cuota por plan** en `subscription_plans.max_branches` = sucursales además de
  la principal (Básico 2 · Pro 10 · Enterprise sin límite). Se valida al crear
  o reactivar una sucursal y al bajar de plan (`branches_quota_guard`,
  `tenants_plan_guard`). La UI la muestra con `branch_quota()`.
- **Operación por sucursal.** `orders`, `restaurant_tables`, `kitchen_tickets`,
  `reservations`, `waitlist` y `cash_register_closes` tienen `branch_id`
  obligatorio (por defecto, la principal) con FK compuesta
  `(tenant_id, branch_id)`: una fila no puede apuntar a la sucursal de otro
  restaurante. Los números de mesa son únicos por sucursal.

## 2. Modelo de datos (normalización)

| Concepto | Tablas | Nota |
|---|---|---|
| Pedido | `orders` + `order_lines` | `kind`: mesa / llevar / delivery. `order_lines.sent_qty` = lo ya enviado a cocina. |
| Delivery | `delivery_orders` (1:1 con `orders`, misma id) | Solo datos de reparto. Platos y totales en `orders`/`order_lines`, así el delivery entra en reportes, caja, inventario y comprobantes. Lectura: vista `v_delivery_orders`. |
| Inventario | `inventory_items` (catálogo) + `inventory_stock` (por sucursal) + `inventory_movements` (kardex) | El stock es la suma del kardex (trigger). Una venta descuenta cada insumo una sola vez. |
| Comprobantes | `comprobantes` + `sunat_outbox` | La lista se lee sin XML/CDR; esos se piden al abrir el detalle. |
| Cajas | `pos_terminals` | Serie SUNAT propia por caja (B001/F001, B002/F002…). |
| MRR | vista `v_tenants` | Se deriva del precio del plan; no se guarda. |

Se eliminaron `online_orders`, `sunat_credentials`, `payroll_entries` (sin uso)
y `tenants.mrr` (derivado).

## 3. Operaciones del POS y modo sin conexión

```
 Pantalla ──► PosService ──► SyncEngine ──► cola (IndexedDB) ──► backend
   ▲              │               │                                 │
   └── vista = base del servidor + operaciones aún no confirmadas ◄─┘
```

- Cada acción del salón es una **operación** con id propio
  (`src/data/pos/ops.ts`): abrir mesa, agregar plato, enviar comanda, cobrar,
  transferir, unir, avanzar comanda, delivery, ajuste de inventario, emitir
  comprobante.
- **Una sola lógica** (`src/data/pos/reduce.ts`) aplica la operación en la
  pantalla al instante; el servidor aplica la misma regla en SQL
  (`app.pos_exec`, migración 0032). `supabase/tests/sync.db.test.ts` verifica
  que ambas den el mismo resultado.
- **Sin internet**: la operación queda en la cola del dispositivo (sobrevive a
  recargas y cierres) y se envía sola al volver la red. El servidor:
  - aplica cada operación una sola vez (`pos_ops`), aunque llegue repetida;
  - guarda la **hora real** en que ocurrió (`at`), así los reportes y la caja
    quedan con la fecha correcta;
  - resuelve conflictos entre equipos: dos equipos abren la misma mesa → los
    pedidos se unen (`order_redirects`); cobrar algo ya cobrado → rechazo
    legible que el dispositivo muestra en el panel de sincronización.
- **Comprobantes sin red**: cada caja numera con su propia serie, así no choca
  con otra caja. Si el número ya se usó, el servidor asigna el siguiente.
- **Cocina sin red**: la pantalla de cocina (otro equipo) recibe la comanda al
  volver internet; mientras tanto el mesero puede imprimirla.
- **Lecturas**: mesas, pedidos abiertos, cocina y delivery salen de la vista
  local (instantáneas). El resto (carta, clientes, ajustes, reportes…) se lee
  del servidor y se guarda para poder abrir la app sin red.

## 4. Rendimiento

- `pos_snapshot` entrega en **una llamada** el estado operativo; luego solo lo
  cambiado desde la última lectura (`updated_at` + solapamiento de 30 s).
- `pos_apply` envía **un lote** de operaciones por llamada (antes, 4-8 consultas
  por acción, con N+1 al leer pedidos).
- Realtime **filtrado por tenant** (sin filtro, cada cliente recibía y el
  servidor autorizaba eventos de todos los tenants) y con las tablas agregadas a
  la publicación `supabase_realtime`. Varios eventos seguidos → una sola lectura.
- Sin sondeos cada 4-5 s: respaldo cada 60 s solo con la pestaña visible.
- RLS con **InitPlan**: las políticas usan
  `tenant_id = any ((select app.my_tenant_ids())::uuid[])`, que se evalúa una vez
  por consulta y no por fila.
- Índices parciales para lo que realmente se consulta: pedidos abiertos por
  sucursal, ventas por fecha, comandas abiertas, cola SUNAT, delta de sincronización.
- Ventas por sucursal agregadas en SQL (`branch_sales`).

## 5. Pruebas

| Qué | Dónde |
|---|---|
| Migraciones + seed en Postgres real (PGlite) | `supabase/tests/db.test.ts` |
| RLS, árbol, cuotas, integridad | `supabase/tests/rls.db.test.ts`, `arquitectura.db.test.ts` |
| Operaciones atómicas e idempotentes | `supabase/tests/pos_ops.db.test.ts` |
| Motor offline contra SQL real | `supabase/tests/sync.db.test.ts` |
| Offline de punta a punta (demo) | `src/data/sync/engine.test.ts`, `e2e/offline.spec.ts` |

`npm run db:bundle` regenera `supabase/setup_all.sql` (una prueba falla si
quedó desactualizado).
