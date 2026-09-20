# Edge Function `sunat-emitir` — facturación electrónica SUNAT

Emite comprobantes electrónicos (boleta, factura y **nota de crédito** tipo 07)
a SUNAT: arma el **UBL 2.1** (`Invoice` o `CreditNote`), lo **firma**
(RSA‑SHA256), lo comprime y lo envía por **SOAP `sendBill`**. Por defecto apunta
al **ambiente beta / homologación** de SUNAT.

Para una nota de crédito el DTO incluye `tipo: "07"`, `refFolio` (documento
afectado), `refTipo` (`01`/`03`), `motivo` y `motivoCodigo` (catálogo 09). El
resumen diario de boletas se registra en el POS; su envío real (RC) queda como
siguiente seam a implementar sobre esta misma función.

- Lógica portable y con tests: `supabase/functions/_shared/sunat/` (UBL, importe
  en letras, ZIP, firma). Corre con `npm test`.
- Handler HTTP (Deno): `supabase/functions/sunat-emitir/index.ts`.
- El frontend la invoca vía `supabase.functions.invoke("sunat-emitir")` cuando
  `VITE_SUNAT_MODE=beta` (ver `src/data/sunat/functionGateway.ts`); en otro caso
  usa un stub y no envía nada real.

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
