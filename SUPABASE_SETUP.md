# Wayra POS — Guía completa de Supabase (de cero a producción)

Esta guía crea **todo** en Supabase: esquema, seguridad (RLS), **datos de prueba**,
cuentas de acceso, Edge Functions y las variables de entorno del frontend.

> Tiempo estimado: 20–30 min. No necesitas saber SQL: casi todo es copiar/pegar.

Índice
1. [Requisitos](#1-requisitos)
2. [Crear el proyecto Supabase](#2-crear-el-proyecto-supabase)
3. [Aplicar el esquema (migraciones)](#3-aplicar-el-esquema-migraciones)
4. [Cargar los datos de prueba (seed)](#4-cargar-los-datos-de-prueba-seed)
5. [Crear las cuentas de acceso](#5-crear-las-cuentas-de-acceso)
6. [Conectar el frontend (.env / Vercel)](#6-conectar-el-frontend-env--vercel)
7. [Habilitar Realtime](#7-habilitar-realtime)
8. [Desplegar las Edge Functions + secrets](#8-desplegar-las-edge-functions--secrets)
9. [Verificación (smoke test)](#9-verificación-smoke-test)
10. [Qué trae el seed](#10-qué-trae-el-seed)
11. [Solución de problemas](#11-solución-de-problemas)

---

## 1) Requisitos
- Cuenta en https://supabase.com (plan free sirve).
- El repo `RivaldoOroche/SaasRestaurant` clonado (para los archivos SQL y las funciones).
- Opcional pero recomendado: la **CLI de Supabase** (`npm i -g supabase`) y Docker,
  para aplicar migraciones y desplegar funciones con un comando.

Hay **dos caminos**. Elige uno:
- **A. Dashboard (sin instalar nada)** — copiar/pegar SQL en el navegador. Más simple.
- **B. CLI** — un comando aplica todo. Mejor para repetir/automatizar.

> **Atajo todo-en-uno**: si solo quieres dejar la base lista rápido, abre el
> SQL Editor, pega **`supabase/setup_all.sql`** (contiene las 17 migraciones
> **en orden** + el seed) y pulsa **Run** una sola vez. Luego salta a la
> [sección 5](#5-crear-las-cuentas-de-acceso) (cuentas de Auth). Los pasos 3 y 4
> de abajo son la versión detallada archivo por archivo.

---

## 2) Crear el proyecto Supabase
1. https://supabase.com → **New project**.
2. Nombre: `wayra-pos`. Elige región cercana (p. ej. São Paulo). Define una
   **Database password** y guárdala.
3. Espera ~2 min a que aprovisione.
4. En **Project Settings → API** copia:
   - **Project URL** → será `VITE_SUPABASE_URL`
   - **anon public** key → será `VITE_SUPABASE_ANON_KEY`
   - **service_role** key (secreta) → para las Edge Functions (NO va al frontend).

---

## 3) Aplicar el esquema (migraciones)

Las migraciones están en `supabase/migrations/` y **deben aplicarse en orden**
(`0001` … `0017`).

### Camino A — Dashboard (SQL Editor)
1. En el dashboard: **SQL Editor → New query**.
2. Abre cada archivo de `supabase/migrations/` **en orden numérico**, pega su
   contenido y pulsa **Run**. Uno por uno, de `0001_core_schema.sql` hasta
   `0017_platform_settings.sql`.
   - Cada uno debe terminar en "Success". Si un archivo falla, no sigas: revisa
     que aplicaste el anterior.

> Atajo: puedes pegar varios archivos seguidos en una sola query siempre que
> respetes el orden, pero de a uno es más fácil de depurar.

### Camino B — CLI (recomendado)
```bash
supabase login
supabase link --project-ref <TU-PROJECT-REF>   # el ref está en la URL del dashboard
supabase db push                                # aplica todas las migraciones en orden
```

---

## 4) Cargar los datos de prueba (seed)

Ejecuta **una vez** el archivo `supabase/seed.sql`:
- **Dashboard**: SQL Editor → New query → pega el contenido de `supabase/seed.sql` → **Run**.
- **CLI**: `supabase db execute --file supabase/seed.sql`
  (o `psql "<connection-string>" -f supabase/seed.sql`).

Esto crea el tenant demo **La Higuera** con su carta, mesas por sucursal,
inventario con costos, recetas, clientes, y además puebla la **consola SaaS**
(otros tenants, facturas, tickets, bitácora). Ver [sección 10](#10-qué-trae-el-seed).

---

## 5) Crear las cuentas de acceso

Los usuarios de Auth **no** se crean por SQL. Hazlo en el dashboard:

1. **Authentication → Users → Add user** (email + password, marca *Auto Confirm*):
   - Tu cuenta de **plataforma (SaaS)**, p. ej. `admin@wayrapos.pe`.
   - El **dueño del tenant demo** (Mónica), p. ej. `monica@lahiguera.pe`.
2. Copia el **UUID** de cada usuario (columna del listado) y en **SQL Editor** corre:
```sql
-- Dueño de la plataforma → ve la consola SaaS
insert into memberships (user_id, tenant_id, role)
values ('<uid-plataforma>', null, 'saas');

-- Dueño del tenant demo → ve el POS de La Higuera
insert into memberships (user_id, tenant_id, role)
values ('<uid-monica>', '11111111-1111-1111-1111-111111111111', 'dueno');
```
3. El **staff** (Gerente/Mesero) no necesita cuenta de correo: entra por **PIN**
   en el dispositivo ya autenticado del local. Sus PIN se definen desde
   **Dueño → Personal** (se guardan hasheados).

---

## 6) Conectar el frontend (.env / Vercel)

### Local
Copia `.env.example` a `.env` y completa:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_USE_MOCK=false
VITE_SUNAT_MODE=beta            # o vacío para stub (sin envío real)
VITE_PLATFORM_CARD_PK=          # llave pública Culqi de la plataforma (opcional)
```
Luego `npm install && npm run dev`.

### Vercel (producción)
Project → **Settings → Environment Variables**: agrega las mismas variables
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_USE_MOCK=false`,
`VITE_SUNAT_MODE=beta`, y `VITE_PLATFORM_CARD_PK` si cobrarás suscripción con
tarjeta). El `vercel.json` ya incluye el rewrite SPA. Redeploy.

---

## 7) Habilitar Realtime

Para que la **Cocina (KDS)**, mesas y pedidos se actualicen en vivo:
- **Database → Replication** (o **Realtime**) → agrega a la publicación
  `supabase_realtime` las tablas: `kitchen_tickets`, `orders`, `restaurant_tables`.

(Con la CLI ya quedan si tu esquema las incluye; si no, actívalas aquí.)

---

## 8) Desplegar las Edge Functions + secrets

Las funciones están en `supabase/functions/`. Requieren la CLI:
```bash
supabase functions deploy sunat-emitir
supabase functions deploy sunat-lotes
supabase functions deploy pago-tarjeta
supabase functions deploy onboarding-complete
supabase functions deploy saas-cobrar
```

Carga los **secrets** del proyecto (se leen con el service role):
```bash
supabase secrets set \
  SUPABASE_URL=https://<project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# SUNAT — homologación beta (o los reales en producción):
supabase secrets set \
  SUNAT_CERT_PEM="$(cat cert.pem)" \
  SUNAT_KEY_PEM="$(cat key.pkcs8.pem)"
# (usuario/clave SOL y RUC beta ya tienen valor por defecto MODDATOS/20000000001;
#  para producción, o multi-empresa, cada tenant carga los suyos en Ajustes → Facturación)

# Pasarela de la plataforma (cobro de suscripción a los tenants):
supabase secrets set PLATFORM_CULQI_SECRET=sk_test_xxx
```

Detalle de cada función y de las credenciales por tenant:
`supabase/functions/sunat-emitir/README.md`.

> Sin desplegar funciones la app funciona igual, pero SUNAT/tarjeta/onboarding
> quedan en modo simulado.

---

## 9) Verificación (smoke test)

1. Entra a la app (local o Vercel) → **Login** con el correo/clave de Mónica
   (dueño del tenant). Deberías ver el POS de **La Higuera**.
2. **Mesas**: el selector de Sucursal muestra Miraflores (12 mesas) y San Isidro (8).
3. **Carta / Editor**: los platos muestran costo y margen (recetas cargadas).
4. **SUNAT**: el Monitor lista la boleta B001-1001 y la factura F001-1001 de ejemplo.
5. Sal y entra con el correo de **plataforma** → verás la **consola SaaS** con
   tenants, ingresos, planes, soporte y **Bitácora** poblados.

Aislamiento (RLS): inicia sesión como otro tenant y confirma que **no** ve los
datos de La Higuera.

---

## 10) Qué trae el seed

- **Planes**: Básico S/699, Pro S/1499, Enterprise S/4800.
- **Tenant demo `La Higuera`** (`11111111-…-111111111111`):
  - Ajustes con RUC, razón social, ubigeo, Yape/Plin.
  - **2 sucursales**: Miraflores y San Isidro.
  - **20 mesas** (1–12 Miraflores, 13–20 San Isidro).
  - Carta: 5 categorías, 9 platos, extras y preferencias.
  - Inventario con **costos** + **recetas** (food cost real).
  - 3 clientes de lealtad.
  - 2 comprobantes de ejemplo + contadores de folio.
  - 4 miembros de personal (Mónica, Iker, Ana, Carlos).
- **Consola SaaS**: 5 tenants adicionales (activos, en prueba y suspendido),
  facturas de suscripción, tickets de soporte y eventos de bitácora.
- **Emisor del SaaS** (tu empresa) precargado en `platform_settings`.

---

## 11) Solución de problemas

- **Las mesas salen vacías** → las mesas necesitan `branch_id`. El seed ya lo
  asigna; si creaste mesas a mano, edítalas o vuelve a correr la sección 8 del seed.
- **"permission denied" / no ve datos** → falta la fila en `memberships` para ese
  usuario, o el rol no corresponde. Revisa la [sección 5](#5-crear-las-cuentas-de-acceso).
- **La consola SaaS sale vacía** → el usuario debe tener `memberships` con
  `role='saas'` y `tenant_id = null`.
- **SUNAT/tarjeta no envían nada** → faltan las Edge Functions o sus secrets
  (sección 8), o `VITE_SUNAT_MODE` no es `beta`.
- **Rutas profundas dan 404 en Vercel** → ya está resuelto con `vercel.json`
  (rewrite SPA); asegúrate de que el archivo esté desplegado.
- **Reejecutar el seed** duplica filas en tablas sin clave única (personal, platos).
  Ejecútalo una sola vez; para reiniciar, recrea la base o borra el tenant demo.
```sql
-- Borrar el tenant demo por completo (cae en cascada a sus datos):
delete from tenants where id = '11111111-1111-1111-1111-111111111111';
```

---

Con esto el backend queda operativo con datos de prueba. Para el detalle de la
app y el despliegue del frontend, ver `APP_SETUP.md`.
