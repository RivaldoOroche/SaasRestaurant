# Wayra POS — setup y despliegue

> ¿Vas a montar Supabase desde cero (esquema + datos de prueba + cuentas +
> funciones)? Sigue la guía paso a paso **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)**.


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
supabase functions deploy pago-webhook
supabase functions deploy onboarding-complete
supabase functions deploy saas-cobrar
supabase functions deploy notificar
```

Notificaciones (correo/WhatsApp) — secrets opcionales (si no están, el envío se
omite sin romper el flujo):

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  NOTIFY_FROM="Wayra POS <noreply@tudominio.pe>" \
  WHATSAPP_API_URL=https://tu-endpoint-whatsapp \
  WHATSAPP_API_TOKEN=xxx
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
- **pago-tarjeta** — cobra con las credenciales del tenant en
  `payment_credentials`, enrutando por proveedor (**Culqi / Izipay / Niubiz**)
  en `supabase/functions/_shared/pagos/gateway.ts`.
- **pago-webhook** — recibe los webhooks de la pasarela
  (`?provider=culqi&tenant=<uuid>`), verifica la firma HMAC opcional con el
  `webhook_secret` del tenant y registra el evento de forma **idempotente**
  (`payment_events`, unique `provider,event_id`) para no procesarlo dos veces.
- **onboarding-complete** — crea el dueño y siembra el tenant desde el link firmado.
- **saas-cobrar** — cobra la suscripción de un tenant con la pasarela de **la
  plataforma** (secret `PLATFORM_CULQI_SECRET`); registra la factura SaaS y activa
  el tenant. La consola tokeniza con `VITE_PLATFORM_CARD_PK`.
- **notificar** — envía correo (Resend) o WhatsApp (endpoint configurable). Se
  usa en el correo de bienvenida del onboarding y al responder reclamos; es
  best-effort (si faltan secrets, no envía y no rompe el flujo).

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

En la consola SaaS → **Tenants → + Nuevo cliente** eliges **cómo dar acceso**:

**Opción A — Enviar invitación (recomendada).**
1. Genera un **link firmado** (token hasheado, expira en 14 días, un solo uso).
2. Envía el link al cliente. Abre `/onboarding/<slug>?token=…`, crea su cuenta
   (correo + contraseña) y `onboarding-complete` provisiona: usuario dueño,
   membership, `business_settings` y siembra inicial (mesas + categoría).
3. El cliente ya puede iniciar sesión y configurar su negocio. Así **tú nunca
   manejas su contraseña**.

**Opción B — Crear cuenta ahora (contraseña temporal).**
Para altas asistidas donde tú configuras el local por el cliente: ingresas su
correo y una **contraseña temporal** (hay botón *Generar*). Se crea el tenant y,
vía `onboarding-complete`, su cuenta de dueño de inmediato. Le compartes las
credenciales y le pides cambiar la contraseña al ingresar.

**Regenerar el link.** En la ficha del tenant (**Gestionar**) puedes
**regenerar el link de invitación** si caducó o se perdió: emite uno nuevo e
**invalida los anteriores** (marca los pendientes como usados).

> Ambas opciones requieren la Edge Function `onboarding-complete` desplegada
> (sección 3). En modo demo se simulan.

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
