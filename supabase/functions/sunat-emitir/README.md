# Edge Function `sunat-emitir` — facturación electrónica SUNAT

Emite comprobantes electrónicos (boleta, factura y **nota de crédito** tipo 07)
a SUNAT: arma el **UBL 2.1** (`Invoice` o `CreditNote`), lo **firma**
(RSA‑SHA256), lo comprime y lo envía por **SOAP `sendBill`**. Por defecto apunta
al **ambiente beta / homologación** de SUNAT.

Para una nota de crédito el DTO incluye `tipo: "07"`, `refFolio` (documento
afectado), `refTipo` (`01`/`03`), `motivo` y `motivoCodigo` (catálogo 09).

La función devuelve, además del resultado, el **XML firmado** (`xml`) y el
**CDR** (`cdr`, base64 del ZIP de la constancia), que el POS guarda en
`comprobantes.signed_xml` / `comprobantes.cdr` y ofrece descargar desde el
Monitor SUNAT.

**Resumen diario (RC) y comunicación de baja (RA)** se envían con la función
`sunat-lotes` (mismo esquema de credenciales por tenant). Usan `sendSummary`,
que es asíncrono: `action:"send"` devuelve un `ticket` y `action:"status"`
consulta el CDR cuando SUNAT termina de procesarlo. Los UBL (SummaryDocuments /
VoidedDocuments) están en `_shared/sunat/lotes.ts` con tests.

- Lógica portable y con tests: `supabase/functions/_shared/sunat/` (UBL, importe
  en letras, ZIP, firma). Corre con `npm test`.
- Handler HTTP (Deno): `supabase/functions/sunat-emitir/index.ts`.
- El frontend la invoca vía `supabase.functions.invoke("sunat-emitir")` cuando
  `VITE_SUNAT_MODE=beta` (ver `src/data/sunat/functionGateway.ts`); en otro caso
  usa un stub y no envía nada real.

## 0) Credenciales por tenant (multi-empresa)

El frontend envía `tenantId` en el cuerpo. Si la función tiene `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` como secrets, resuelve el **emisor** desde
`business_settings` (RUC, razón social, dirección, ubigeo, usuario SOL, modo) y
las **credenciales secretas** desde `fiscal_credentials` (clave SOL, certificado
PEM, llave PKCS#8) de ese tenant. El modo (`beta`/`produccion`) elige el endpoint
automáticamente. Si no hay service role o no se encuentra el tenant, se usan las
variables de entorno de abajo (útil para una única empresa u homologación beta).

Cada tenant configura todo esto desde **Ajustes → Facturación** en la app; las
credenciales secretas se guardan write-only (nunca se devuelven al navegador) y
solo esta función las lee con el service role.

## 0.1) Proveedor de facturación (multi-modo)

Cada tenant elige en **Ajustes → Facturación** cómo emitir, y la función enruta
según `business_settings.billing_provider` (ver `_shared/sunat/emisor.ts`):

| Proveedor | Cómo emite | Necesita |
|---|---|---|
| `sunat_directo` | Firma el UBL con el **certificado del tenant** y hace `sendBill` al WS de SUNAT (beta/prod según `sunat_mode`) | `sol_user`, `sol_pass`, `cert_pem`, `key_pem` |
| `efact` / `bizlinks` (OSE) | Igual que el directo pero al **endpoint del OSE** (`billing_endpoint`) con las credenciales del OSE | `billing_endpoint`, `sol_user`, `sol_pass`, `cert_pem`, `key_pem` |
| `nubefact` | Envía **JSON** al API de Nubefact (`billing_endpoint` = la *ruta* del emisor) con `Authorization: <api_token>`; Nubefact arma, firma y envía por ti y devuelve enlaces al PDF/XML y la cadena QR | `billing_endpoint`, `api_token` |

Todos devuelven el mismo `EmitResult` normalizado
(`accepted`, `code`, `description`, `folio`, y según el caso `cdr`/`xml` o
`pdfUrl`/`xmlUrl`/`qr`). Con Nubefact **no** hace falta cargar certificado.

Para una sola empresa sin service role, puedes fijar el proveedor por entorno:
`SUNAT_PROVIDER` (`sunat_directo` por defecto), `SUNAT_ENDPOINT`, `SUNAT_API_TOKEN`.

## 1) Credenciales de homologación (SUNAT beta)

SUNAT publica un RUC y usuario SOL de pruebas:

```
RUC        20000000001
Usuario    MODDATOS
Clave      MODDATOS
Endpoint   https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService
```

## 2) Certificado digital de prueba

En beta, un certificado autofirmado es suficiente. Genera uno (PKCS#8 + X.509):

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj "/C=PE/O=Empresa Demo SAC/CN=20000000001"
# Asegúrate de que key.pem sea PKCS#8 (encabezado "BEGIN PRIVATE KEY").
# Si dice "BEGIN RSA PRIVATE KEY", conviértelo:
openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem
```

Para **producción** se usa el certificado tributario real del contribuyente
(no autofirmado).

## 3) Cargar secrets en Supabase

```bash
supabase secrets set \
  SUNAT_ENDPOINT="https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService" \
  SUNAT_RUC="20000000001" \
  SUNAT_SOL_USER="MODDATOS" \
  SUNAT_SOL_PASS="MODDATOS" \
  SUNAT_RAZON_SOCIAL="EMPRESA DEMO SAC" \
  SUNAT_DIRECCION="AV. LA MAR 1234, MIRAFLORES, LIMA" \
  SUNAT_UBIGEO="150122" \
  SUNAT_CERT_PEM="$(cat cert.pem)" \
  SUNAT_KEY_PEM="$(cat key.pkcs8.pem)"
```

## 4) Desplegar la función

```bash
supabase functions deploy sunat-emitir
```

## 5) Activar en el frontend

En el entorno (Vercel → Environment Variables, o `.env`):

```
VITE_SUNAT_MODE=beta
```

Redeploy del frontend. A partir de ahí, al **Emitir** una boleta/factura en el
cobro, la app llama a la función, que firma y envía a SUNAT beta; el estado
(aceptada / rechazada) se refleja en el comprobante y en el Monitor SUNAT.

## 6) Probar la homologación

1. Cobra un pedido y elige **Factura** con RUC `20512345678` (o **Boleta**).
2. La función devuelve `accepted: true` y el CDR cuando SUNAT lo acepta.
3. Verifica en el **Monitor SUNAT** de la app.

## Notas y límites conocidos

- **Canonicalización (C14N):** el XML se emite ya canónico y la firma se valida
  en round‑trip por tests; la aceptación exacta de la firma debe confirmarse en
  beta. Si SUNAT rechaza por firma, la vía robusta es usar `xmlsec1` en el
  runtime o un **OSE/PSE** (que firma por ti).
- **Líneas de detalle:** hoy la función arma una línea "Consumo" a partir del
  subtotal. Para detalle por ítem, envía `items[]` en el body (ya soportado por
  el UBL builder).
- **Multi‑tenant (producción):** en vez de secrets globales, usar la tabla
  `sunat_credentials` (migración `0008`) leída por la función con el service role;
  cada tenant con su RUC, serie y certificado.
- **CDR:** hoy se detecta aceptación por la presencia de `applicationResponse`;
  parsear el `ResponseCode` del CDR (descomprimirlo) es una mejora pendiente.
