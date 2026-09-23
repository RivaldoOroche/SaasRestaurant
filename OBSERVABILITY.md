# Wayra POS — Observabilidad, alertas y respaldos

Guía operativa para saber **cuándo algo falla** y **cómo recuperarte**.

---

## 1. Errores del frontend

La app instala manejadores globales de error (`src/lib/observability.ts`,
llamado en `main.tsx`). Sin configuración, registra en consola. Para enviarlos a
un colector, define en el entorno (Vercel → Environment Variables):

```
VITE_ERROR_WEBHOOK=https://<tu-endpoint-de-ingesta>
```

Puede ser un endpoint de **Sentry** (proyecto Browser), Logflare, o uno propio.
Para Sentry completo (breadcrumbs, releases, source maps): añade
`@sentry/browser`, inicialízalo en `initObservability()` y sube los source maps
en el build de Vercel.

## 2. Errores del backend (Edge Functions)

Cada función devuelve errores con `try/catch`. Para agregarlos:

- **Logs de Supabase**: Dashboard → Edge Functions → Logs (por función).
- **Sentry para Deno**: importa `https://deno.land/x/sentry` en las funciones
  críticas (`sunat-emitir`, `pago-tarjeta`, `saas-cobrar`) y captura en el catch.

## 3. Alertas de negocio (ya tienes los datos)

No necesitas otra herramienta para lo más importante: la app ya persiste señales
de falla que puedes vigilar desde la **consola SaaS → Bitácora** (filtro nivel
*error*) o con una consulta programada:

- **SUNAT**: `comprobantes.status = 'rechazada'` o `sunat_outbox.attempts` alto.
- **Pagos**: `payment_events.status` fallido; `subscription_charges.status =
  'fallida'`.
- **Suscripciones en riesgo**: `tenants.status = 'Suspendido'`.

Esto ya está implementado en la Edge Function **`cron-tareas`** (ver §6): corre
el dunning y envía un correo de alertas cuando hay comprobantes rechazados,
cobros fallidos o tenants suspendidos.

## 4. Respaldos (backups)

- **Point-in-Time Recovery (PITR)**: en Supabase (planes Pro+) actívalo en
  Dashboard → Database → Backups. Permite restaurar a cualquier segundo.
- **Backups diarios**: Supabase los toma automáticamente; verifica la retención
  de tu plan.
- **Export manual / off-site** (recomendado además del automático):

  ```bash
  # Volcado completo a un archivo (guárdalo fuera de Supabase, p. ej. S3):
  supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F).sql
  ```

  Programa esto en un GitHub Action semanal y sube el `.sql` cifrado a tu
  almacenamiento.

- **Prueba de restauración**: al menos una vez por trimestre, restaura un backup
  en un proyecto de staging y valida que la app levanta. Un backup no probado no
  es un backup.

## 5. Uptime

- Monitor externo (UptimeRobot / BetterStack) apuntando a la URL de la app y a un
  endpoint de salud de una Edge Function.
- El panel de **Retención → Estado de servicios** de la consola SaaS resume la
  salud de API/DB/SUNAT/Pagos.

## 6. Tareas programadas (dunning + alertas)

La Edge Function **`cron-tareas`** hace dos cosas con el service role, en una
sola corrida diaria:

1. **Dunning**: propone los cobros de suscripción del periodo para los tenants
   Activos/Suspendidos que no tengan una propuesta abierta. **No cobra**: el
   dueño del SaaS las aprueba en la consola → **Cobros** (cada cobro pasa por
   validación de RUC/razón social antes de ejecutarse).
2. **Alertas**: cuenta comprobantes rechazados, cobros fallidos y tenants
   suspendidos de las últimas 24 h y, si hay novedades, envía un correo de
   resumen al `billing_email` de `platform_settings` (vía `notificar`).

Protégela con un secreto y prográmala con **una** de estas dos opciones:

```bash
supabase secrets set CRON_SECRET=$(openssl rand -hex 16)
supabase functions deploy cron-tareas
```

- **Opción A — GitHub Action** (sin extensiones de BD): `.github/workflows/cron.yml`
  ya está listo; define en el repo los secrets `SUPABASE_FUNCTIONS_URL`
  (`https://<ref>.functions.supabase.co`), `SUPABASE_ANON_KEY` y `CRON_SECRET`.
  Corre a las 13:00 UTC y puede dispararse a mano desde la pestaña *Actions*.
- **Opción B — pg_cron** (desde la base): ejecuta `supabase/cron_pg_cron.sql`
  reemplazando los marcadores por los tuyos.

Prueba manual:

```bash
curl -X POST "https://<ref>.functions.supabase.co/cron-tareas" \
  -H "Authorization: Bearer <ANON_KEY>" -H "x-cron-secret: <CRON_SECRET>"
```

---

Con esto tienes: errores del cliente y del servidor, alertas automáticas sobre
las señales de negocio que ya guardas, dunning programado con aprobación,
respaldos con capacidad de restaurar, y monitoreo de disponibilidad.
