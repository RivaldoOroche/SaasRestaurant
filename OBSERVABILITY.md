# Wayra POS — Observabilidad, alertas y respaldos

Guía operativa para saber **cuándo algo falla** y **cómo recuperarte**.

---

## 1. Errores del frontend (Sentry)

`src/lib/observability.ts` (se inicia en `main.tsx`):

| Variable (Vercel → Environment Variables) | Para qué |
| --- | --- |
| `VITE_SENTRY_DSN` | Activa Sentry (proyecto *React*). Sin ella, Sentry ni siquiera se descarga. |
| `VITE_SENTRY_TRACES` | Muestreo de rendimiento (por defecto `0.05` = 5 %). |
| `VITE_APP_ENV` | `production` / `staging`. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | (Build) suben los *source maps* a Sentry y los borran del sitio publicado. |
| `VITE_ERROR_WEBHOOK` | Opcional: además, un beacon JSON a un endpoint propio. |

Qué llega a Sentry:

- Errores no controlados, promesas rechazadas y **fallos de pantalla**
  (`ErrorBoundary`: el usuario ve «Algo salió mal · Recargar» en vez de una
  página en blanco; su cola de pedidos no se pierde).
- **Operaciones rechazadas** al sincronizar (aviso de nivel *warning*: p. ej. un
  cobro que el servidor no aceptó) y el rastro de cortes/recuperaciones de red.
- Etiquetas: `tenant`, `branch`, `role`, `device` y la versión (`release` = commit).

Privacidad (Ley 29733): `sendDefaultPii: false`, sin IP, sin cabeceras ni
*query strings*; los mensajes pasan por `scrub()` que oculta correos, RUC, DNI y
celulares. El usuario se identifica solo por un id opaco. Sentry figura como
subencargado en la Política de privacidad (`src/legal/entity.ts`).

Alertas sugeridas en Sentry: *New issue* → correo/Slack; *Operación rechazada*
> 10 en 1 h; errores en `/pos/pedido` o `/pos/caja` → prioridad alta.

## 2. Errores del backend (Edge Functions)

Las 10 funciones se sirven con `withMonitoring("<nombre>", handler)`
(`supabase/functions/_shared/monitor`), sin dependencias:

- Excepciones no controladas → se reportan y el cliente recibe
  «Error interno. Ya fue reportado.» (500).
- Respuestas **5xx** (p. ej. SUNAT u OSE caído) → se reportan con su mensaje.
- Configura el secret: `supabase secrets set SENTRY_DSN=... APP_ENV=production APP_VERSION=<commit>`.
- No se envían cuerpos ni cabeceras de la petición (datos personales/credenciales).

Los logs de cada función siguen en Dashboard → Edge Functions → Logs.

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

Tres capas, de la más rápida a la más independiente:

1. **PITR de Supabase** (plan Pro + add-on): restaura a cualquier segundo.
   Dashboard → Database → Backups. Ideal ante un borrado accidental.
2. **Backups diarios de Supabase** (automáticos, 7 días en Pro).
3. **Respaldo propio, cifrado y fuera de Supabase** — ya configurado en
   `.github/workflows/backup.yml`, todos los días a las 02:17 (Lima):
   - `scripts/backup/backup.sh`: `pg_dump` (esquemas `public`, `app`, `auth`),
     verificado con `pg_restore --list`, cifrado AES-256 (`gpg`) + `sha256`.
   - Se guarda 35 días como artefacto de GitHub y, si configuras un bucket,
     también en S3 / Cloudflare R2.
   - **Prueba de restauración automática en cada corrida**
     (`scripts/backup/restore-check.sh`): restaura en un Postgres 16 limpio y
     verifica restaurantes, sedes principales, pedidos, comprobantes y las
     funciones `pos_apply` / `pos_snapshot`. Si falla, el workflow queda en
     rojo y GitHub te avisa por correo.

   Secrets del repositorio (Settings → Secrets → Actions):

   | Secret | Valor |
   | --- | --- |
   | `SUPABASE_DB_URL` | Cadena del *Session pooler* (Dashboard → Connect). |
   | `BACKUP_PASSPHRASE` | Clave larga; guárdala también en tu gestor de contraseñas: sin ella el respaldo no se puede abrir. |
   | `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY_ID`, `BACKUP_S3_SECRET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT` | Opcionales (R2: `ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com`, `REGION=auto`). |

   Restaurar a mano (p. ej. a un proyecto nuevo):

   ```bash
   gpg --decrypt wayra-<fecha>.dump.gpg > wayra.dump
   pg_restore --no-owner --no-privileges -d "$NUEVA_DB_URL" wayra.dump
   ```

   Probado en local: volcado 56 KB (datos demo), restauración y verificación OK.

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
