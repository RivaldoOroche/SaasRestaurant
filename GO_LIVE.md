# Wayra POS — Checklist de puesta en producción

Guía paso a paso para pasar de demo a producción. Marca cada casilla al
completarla. Referencias: `SUPABASE_SETUP.md` (backend), `APP_SETUP.md`
(app/deploy), `OBSERVABILITY.md` (monitoreo, backups, cron).

> Orden recomendado: arranca la **sección 1 (trámites)** en paralelo desde ya —
> no dependen del código y son las de mayor plazo. El resto (2–9) lo haces tú
> en 1–2 horas.

---

## 1) Trámites legales y comerciales (empezar YA, en paralelo)

- [ ] **Certificado digital tributario** de tu empresa (para SUNAT producción).
- [ ] **Homologación SUNAT** (si emites directo) **o contrato con un OSE/PSE**
      (Nubefact, Efact, Bizlinks) y obtención de sus credenciales/endpoint.
- [ ] **Alta con la pasarela de pago** (Culqi / Izipay / Niubiz): llaves de
      producción (pública y secreta) y URL de webhook.
- [ ] **Cumplimiento**: Libro de Reclamaciones (ya integrado), política de datos
      (Ley 29733) y Términos — publicados en `/legal/privacidad` y `/legal/terminos`.
- [ ] Registrar el **RUC del SaaS** y tus datos de emisor (los cargarás en la consola).

---

## 2) Provisionar Supabase (backend)

- [ ] Crear proyecto en https://supabase.com (elegir región cercana).
- [ ] **SQL Editor → pegar `supabase/setup_all.sql` → Run** (24 migraciones + seed).
      Debe terminar en *Success*.
- [ ] **Auth → Users**: crear tu cuenta de **plataforma (SaaS)** y el **dueño demo**.
- [ ] Insertar sus `memberships` (SQL) — ver `SUPABASE_SETUP.md §5`:
  - Plataforma: `role='saas'`, `tenant_id = null`.
  - Dueño tenant: `role='dueno'`, `tenant_id='<uuid>'`.
- [ ] **Database → Replication**: agregar a `supabase_realtime` las tablas
      `kitchen_tickets`, `orders`, `restaurant_tables` (Cocina/Mesas en vivo).
- [ ] Copiar de **Settings → API**: `Project URL`, `anon key`, `service_role key`.

---

## 3) Secrets del backend (Edge Functions)

`supabase secrets set …` (o Dashboard → Edge Functions → Secrets):

**Base (obligatorio):**
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**SUNAT (si facturas directo; con OSE por-tenant puede ir vacío):**
- [ ] `SUNAT_PROVIDER` (`sunat_directo` por defecto), `SUNAT_MODE` (`beta`/`produccion`)
- [ ] `SUNAT_RUC`, `SUNAT_SOL_USER`, `SUNAT_SOL_PASS`, `SUNAT_RAZON_SOCIAL`,
      `SUNAT_DIRECCION`, `SUNAT_UBIGEO`
- [ ] `SUNAT_CERT_PEM`, `SUNAT_KEY_PEM` (o cada tenant carga los suyos en Ajustes)
- [ ] `SUNAT_ENDPOINT` / `SUNAT_API_TOKEN` solo si usas un OSE global

**Pasarela de suscripciones (cobro a los tenants):**
- [ ] `PLATFORM_CULQI_SECRET`

**Notificaciones (opcional; si faltan, no se envían):**
- [ ] `RESEND_API_KEY`, `NOTIFY_FROM`
- [ ] `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`

**Cron (dunning + alertas):**
- [ ] `CRON_SECRET` = `openssl rand -hex 16`

> Nota: las credenciales de **cada restaurante** (SUNAT/OSE y pasarela) NO son
> secrets: se cargan por tenant en **Ajustes → Facturación / Pagos** (write-only).
> Las del **emisor del SaaS** se cargan en **Consola → Config**.

---

## 4) Desplegar Edge Functions

```bash
supabase functions deploy sunat-emitir
supabase functions deploy sunat-lotes
supabase functions deploy pago-tarjeta
supabase functions deploy pago-webhook
supabase functions deploy onboarding-complete
supabase functions deploy saas-cobrar
supabase functions deploy notificar
supabase functions deploy cron-tareas
supabase functions deploy push-enviar   # notificaciones push (requiere secrets VAPID_*)
supabase functions deploy contacto      # formulario de la landing
```

- [ ] Las 10 funciones desplegadas sin error.
- [ ] Push: secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ver `supabase/functions/push-enviar/README.md`).
- [ ] Configurar la **URL de webhook** de la pasarela apuntando a
      `…/functions/v1/pago-webhook?provider=<culqi|izipay|niubiz>&tenant=<uuid>`.

---

## 5) Frontend (Vercel)

Project → **Settings → Environment Variables**:

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_USE_MOCK=false`
- [ ] `VITE_SUNAT_MODE=beta` (o `produccion`)
- [ ] `VITE_PLATFORM_CARD_PK` (llave **pública** de tu pasarela SaaS, si cobras con tarjeta)
- [ ] `VITE_ERROR_WEBHOOK` (opcional, para el beacon de errores)
- [ ] `VITE_VAPID_PUBLIC_KEY` (clave **pública** VAPID, para notificaciones push)
- [ ] Framework **Vite**, build `npm run build`, output `dist`. `vercel.json` ya trae el rewrite SPA
      y los headers de la PWA (`sw.js` sin caché, MIME del manifest, assets inmutables).
- [ ] **PWA**: abrir el dominio en Chrome (Android) → debe ofrecer «Instalar»; en iPhone,
      Safari → Compartir → «Agregar a inicio». Requiere **HTTPS** (Vercel ya lo da).
- [ ] **Redeploy** y confirmar que carga con datos reales (no demo).

---

## 6) Programar el cron (dunning + alertas)

Elegir **una** opción (`OBSERVABILITY.md §6`):

- [ ] **GitHub Action** (`.github/workflows/cron.yml`): definir secrets del repo
      `SUPABASE_FUNCTIONS_URL`, `SUPABASE_ANON_KEY`, `CRON_SECRET`.
- [ ] **o pg_cron**: ejecutar `supabase/cron_pg_cron.sql` con tus valores.
- [ ] Prueba manual: `curl -X POST …/cron-tareas -H "x-cron-secret: …"` → `{ok:true}`.

---

## 7) Observabilidad y respaldos

- [ ] **Backups**: activar PITR en Supabase (Pro+) y/o `supabase db dump` semanal off-site.
- [ ] **Errores**: `VITE_ERROR_WEBHOOK` (o Sentry) recibiendo eventos.
- [ ] **Alertas de negocio**: el correo de `cron-tareas` llega al `billing_email`.
- [ ] **Uptime**: monitor externo (UptimeRobot/BetterStack) a la app y a una función.
- [ ] Probar una **restauración** de backup en staging al menos una vez.

---

## 8) Verificación funcional (smoke de producción)

- [ ] Login del **dueño** (email+clave) → ve su POS; si entró con clave temporal,
      la app fuerza el cambio.
- [ ] **2FA**: activarlo en Consola → Config y confirmar el desafío al re-loguear.
- [ ] **Pedido → Cocina (KDS en vivo) → Cobrar** con propina/descuento; imprime ticket.
- [ ] **Emitir** boleta y factura → aceptadas por SUNAT (o el OSE); XML/CDR/QR visibles.
- [ ] **Nota de crédito** y **resumen diario** funcionan.
- [ ] **Pago con tarjeta** real (monto mínimo) → webhook registrado en `payment_events`.
- [ ] **Reserva** y **lista de espera**; **Libro de Reclamaciones** público envía y se responde.
- [ ] **Permisos**: quitar una pantalla a "Mesero" y verificar que desaparece de su menú.
- [ ] Consola SaaS: **crear tenant** (link o cuenta con clave temporal) →
      **Preparar cobro → aprobar en Cobros** (valida RUC) → factura emitida.
- [ ] **Cohortes** e **Ingresos por mes** muestran datos reales; **Bitácora** registra eventos.
- [ ] **Aislamiento (RLS)**: con dos tenants, ninguno ve datos del otro.

---

## 9) Seguridad (revisión final)

- [ ] `VITE_USE_MOCK=false` en producción (no queda el login por PIN demo).
- [ ] Ningún secret en el frontend (solo llaves **públicas** y anon key).
- [ ] Credenciales secretas (SUNAT/pasarela) guardadas **write-only** (sin SELECT).
- [ ] 2FA activo en la cuenta de plataforma; auditoría de accesos poblándose.
- [ ] Contraseñas temporales forzando cambio en el primer ingreso.

---

## 10) Post-lanzamiento

- [ ] Onboardear los primeros restaurantes reales (link firmado o alta con clave).
- [ ] Revisar la **Bitácora** y el correo de alertas diario la primera semana.
- [ ] Confirmar la primera **cobranza de suscripción** aprobada y facturada.

---

Pendiente fuera de alcance (crecimiento futuro): app móvil dedicada de meseros
e integraciones de delivery (Rappi/PedidosYa).

---

## Delivery (sin pasos extra de backend)

Las tablas y la función pública de seguimiento vienen en la migración `0029_delivery.sql`
(incluida en `setup_all.sql`). Antes de tomar pedidos, en **Delivery → Zonas y repartidores**:

- [ ] Crear las **zonas de reparto** con su costo de envío y tiempo estimado.
- [ ] Registrar a los **repartidores** (celular válido) y activar a los que estén de turno.
- [ ] Probar un pedido de punta a punta: crear → aceptar (aparece en Cocina con 🛵) →
      listo → despachar → abrir el enlace de seguimiento desde un celular → entregado.
