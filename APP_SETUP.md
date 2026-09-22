# Wayra POS — setup y despliegue

React + TypeScript (Vite) sobre Supabase (Postgres + Auth + RLS) + Edge Functions
(Deno). SUNAT (facturación electrónica), pagos con tarjeta y onboarding de tenants
usan Edge Functions con service role.

---

## 1. Correr en local (modo demo, sin backend)

```bash
npm install
npm run dev
```

Sin `.env`, la app corre en **modo demo**: login por PIN contra usuarios mock
(1111 Dueña · 2222 Gerente · 3333/4444 Mesero · 0000 SaaS), sin backend. Todo
(SUNAT, tarjeta, onboarding) se simula para trabajar la UI.

| comando | qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | typecheck + build de producción |
| `npm run test` | pruebas unitarias (Vitest) |

---

## 2. Conectar Supabase (backend real)

1. Crea un proyecto en https://supabase.com.
2. Copia `.env.example` a `.env` y completa:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   VITE_USE_MOCK=false
   VITE_SUNAT_MODE=beta   # o vacío para stub
   ```
3. Aplica las migraciones **en orden** (SQL editor o `supabase db push`):
   `0001_core_schema` → `0002_rls` → `0003` … → `0015_cdr_xml`.
   (Todas están en `supabase/migrations/`; incluyen pagos, facturación,
   notas de crédito, CDR/XML, etc.)
4. Carga datos demo opcionales: `supabase/seed.sql`.

### Crear cuentas

SQL no crea usuarios de auth, así que:

1. En **Auth → Users**, crea al dueño de la plataforma y a cada dueño de tenant
   (email + contraseña). *(Para tenants nuevos, mejor usa el onboarding — sección 5.)*
2. Inserta las `memberships` que vinculan cada `auth.users.id` con su rol:
   ```sql
   -- dueño de la plataforma (SaaS)
   insert into memberships (user_id, tenant_id, role) values ('<uid>', null, 'saas');
   -- dueño de un tenant
   insert into memberships (user_id, tenant_id, role)
   values ('<uid>', '<tenant-id>', 'dueno');
   ```

Los dueños entran con email + contraseña; el staff (Gerente/Mesero) entra con PIN
en un dispositivo ya autenticado.

---

## 3. Edge Functions (Deno)

Despliega con la CLI de Supabase:

```bash
supabase functions deploy sunat-emitir
supabase functions deploy sunat-lotes
supabase functions deploy pago-tarjeta
supabase functions deploy onboarding-complete
supabase functions deploy saas-cobrar
```

Secrets del proyecto (se leen con el service role):

```bash
supabase secrets set \
  SUPABASE_URL=https://<project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

- **sunat-emitir / sunat-lotes** — facturación electrónica. El emisor y las
  credenciales (clave SOL, certificado, llave) se toman por tenant de
  `business_settings` + `fiscal_credentials`. Para una sola empresa u
  homologación beta puedes usar variables de entorno (ver
  `supabase/functions/sunat-emitir/README.md`): `SUNAT_RUC`, `SUNAT_SOL_USER`,
  `SUNAT_SOL_PASS`, `SUNAT_CERT_PEM`, `SUNAT_KEY_PEM`, `SUNAT_MODE`.
- **pago-tarjeta** — cobra con la llave secreta del tenant en
  `payment_credentials` (Culqi implementado; Izipay/Niubiz como seam).
- **onboarding-complete** — crea el dueño y siembra el tenant desde el link firmado.
- **saas-cobrar** — cobra la suscripción de un tenant con la pasarela de **la
  plataforma** (secret `PLATFORM_CULQI_SECRET`); registra la factura SaaS y activa
  el tenant. La consola tokeniza con `VITE_PLATFORM_CARD_PK`.

Cada tenant configura sus datos y credenciales desde **Ajustes → Datos del emisor /
Facturación / Pagos** (las secretas se guardan write-only, nunca se devuelven al
navegador). Desde ahí también puede descargar el **PDF de configuración**.

---

## 4. Deploy del frontend (Vercel)

- Framework: **Vite** (build `npm run build`, output `dist`).
- `vercel.json` ya incluye el rewrite SPA (rutas profundas como `/carta/:slug` y
  `/onboarding/:slug` sirven `index.html`).
- Variables de entorno en Vercel (Project → Settings → Environment Variables):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_USE_MOCK=false`,
  `VITE_SUNAT_MODE=beta`.

---

## 5. Alta de un nuevo tenant (onboarding)

1. En la consola SaaS → **Tenants → nuevo tenant**: genera un **link firmado**
   (token hasheado, expira en 14 días, un solo uso).
2. Envía el link al cliente. Abre `/onboarding/<slug>?token=…`, crea su cuenta
   (correo + contraseña) y `onboarding-complete` provisiona: usuario dueño,
   membership, `business_settings` y siembra inicial (mesas + categoría).
3. El cliente ya puede iniciar sesión y configurar su negocio.

---

## Estado

Todas las fases implementadas y verificadas en navegador (backend mock):

- **POS**: Pedido, Mesas, Cocina (KDS con SLA), Cobro (checkout, propina, split,
  lealtad; **tarjeta real** Culqi + Yape/Plin QR), Cuentas, Inventario+recetas,
  Clientes, Carta/Editor, En línea, Ajustes, Reportes (+Excel), Caja, Panel.
- **Facturación SUNAT**: boleta, factura, **nota de crédito**, **resumen diario
  (RC)** y **comunicación de baja (RA)**; UBL + firma + ZIP + SOAP; cola offline;
  descarga de **XML firmado y CDR**; homologación beta.
- **Carta pública** por slug (QR), **configuración fiscal** por tenant + PDF.
- **Consola SaaS**: Resumen, Tenants (detalle, impersonación, **onboarding
  end-to-end**, cobro→factura), Retención, Ingresos, Planes, Soporte.

**Pendiente de tu lado**: provisionar Supabase, desplegar las Edge Functions con
sus secrets y probar la homologación real con SUNAT y un cargo real con la
pasarela de tarjeta.
