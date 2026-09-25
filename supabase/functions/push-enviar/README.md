# push-enviar — Notificaciones Web Push

Envía notificaciones push a los navegadores suscritos (tabla `push_subscriptions`).
El cifrado del payload (aes128gcm, RFC 8291) y el JWT VAPID (ES256) están
implementados sin dependencias externas en `../_shared/push/webpush.ts`.

## 1. Generar las claves VAPID (una sola vez)

```bash
npx web-push generate-vapid-keys
# o, desde Deno:
deno eval 'import {generateVapidKeys} from "./_shared/push/webpush.ts"; console.log(await generateVapidKeys())'
```

## 2. Configurar

- Frontend: `VITE_VAPID_PUBLIC_KEY=<publicKey>` (no es secreta).
- Edge Function (secrets):

```bash
supabase secrets set VAPID_PUBLIC_KEY=<publicKey>
supabase secrets set VAPID_PRIVATE_KEY=<privateKey>
supabase secrets set VAPID_SUBJECT=mailto:soporte@wayrapos.pe
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los inyecta Supabase.

## 3. Desplegar

```bash
supabase functions deploy push-enviar
```

## Uso

```
POST /functions/v1/push-enviar
{ "tenantId": "…", "userIds": ["…"], "title": "Comanda lista", "body": "Mesa 5", "url": "/pos/cocina" }
-> { ok, sent, failed, removed }
```

- Filtra por `userIds` y/o `tenantId`. Sin filtros, envía a todas las suscripciones.
- Borra automáticamente las suscripciones caducadas (404/410).
- Si faltan las claves VAPID, responde `{ ok:false, skipped:true }` sin error.
