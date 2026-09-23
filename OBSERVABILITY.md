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

Sugerencia: un cron (Supabase **pg_cron** o un GitHub Action programado) que
consulte estas tablas y dispare la Edge Function `notificar` cuando haya
novedades. Ejemplo de condición diaria:

```sql
select count(*) from comprobantes
where status = 'rechazada' and issued_at > now() - interval '1 day';
```

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

---

Con esto tienes: errores del cliente y del servidor, alertas sobre las señales de
negocio que ya guardas, respaldos con capacidad de restaurar, y monitoreo de
disponibilidad.
