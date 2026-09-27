# Wayra POS — Precios vs. costos y competencia (septiembre 2026)

Modelo reproducible: `python3 scripts/pricing/modelo.py` (edita los supuestos al inicio).

## 1. Costos mensuales de operar el SaaS

Tipo de cambio S/ 3.44 por dólar. A los servicios del extranjero se les suma 18 % de IGV
(no domiciliados). Ese IGV se recupera como crédito fiscal, pero en el modelo lo contamos
como costo para ir a lo seguro.

| Concepto | Hasta 100 clientes | 100–400 clientes | Nota |
| --- | --- | --- | --- |
| Supabase Pro + cómputo | US$ 30 (Small) | US$ 75 (Medium) | Pro US$ 25 incluye US$ 10 de cómputo |
| Supabase PITR (restaurar a cualquier segundo) | — | US$ 100 | recomendable desde ~100 clientes |
| Vercel Pro (1 persona) | US$ 20 | US$ 20 | 1 TB de tráfico incluido |
| Sentry Team | US$ 26 | US$ 26 | 50 000 errores/mes |
| Resend (correos) | gratis → US$ 20 | US$ 20 | desde ~50 clientes |
| Google Workspace (2 cuentas), dominio, R2 | ~US$ 17 | ~US$ 17 | |
| **Infraestructura** | **≈ S/ 380–460** | **≈ S/ 1 050** | |
| Soporte (1 persona cada ~250 locales, S/ 2 800 con beneficios) | S/ 2 800 | S/ 5 600–11 200 | el costo que más crece |
| Contador | S/ 400 | S/ 400 | |

Costos por cliente:

- **Pasarela** (Culqi online 4.20 % + US$ 0.30 + IGV): unos S/ 8.60 por cobro de S/ 149.
  El modelo asume que 60 % paga con tarjeta; con Yape, transferencia o pago anual baja casi a cero.
- **Puesta en marcha:** ~2 h por cliente (S/ 60), repartidas en 24 meses.
- **Comprobantes SUNAT:** **S/ 0** si el restaurante emite con *SUNAT directo* (SEE del
  contribuyente, ya implementado; el certificado digital tributario es gratuito). Si nosotros
  pagáramos un OSE a ~S/ 0.02 por comprobante, serían ~S/ 36 al mes por local (1 800
  comprobantes/mes). Hoy el OSE lo contrata y paga el restaurante con sus propias credenciales.

## 2. Resultado

Mezcla supuesta: 60 % Básico (1.3 locales en promedio), 30 % Pro (3.5 locales),
10 % Enterprise (12 locales). Venta neta = precio ÷ 1.18.

| Clientes | Venta neta/mes | Costos | Utilidad operativa | Margen |
| --- | --- | --- | --- | --- |
| 25 | S/ 6 017 | S/ 3 468 | S/ 2 149 | 36 % |
| 50 | S/ 12 034 | S/ 3 841 | S/ 7 793 | 65 % |
| 100 | S/ 24 068 | S/ 7 225 | S/ 16 443 | 68 % |
| 300 | S/ 72 203 | S/ 15 749 | S/ 56 055 | 78 % |

- **Punto de equilibrio:** 16 restaurantes (solo operación). **60 restaurantes** si además
  se pagan 2 sueldos de S/ 4 000 y S/ 2 000/mes de marketing.
- **Si nosotros pagáramos el OSE:** el margen cae a 20–30 % y el equilibrio con equipo sube a
  **143 restaurantes**. Por eso SUNAT directo debe ser la opción por defecto.
- Antes de impuesto a la renta (Régimen MYPE Tributario: 10 % hasta 15 UIT de utilidad,
  29.5 % sobre el exceso).

Contribución por cliente (100 clientes, SUNAT directo):

| Plan | Precio | Neto | − pasarela | − soporte | − infra y puesta en marcha | Contribución |
| --- | --- | --- | --- | --- | --- | --- |
| Básico | S/ 149 | 126.3 | 5.2 | 14.6 | 7.1 | **S/ 99 (79 %)** |
| Pro | S/ 349 | 295.8 | 11.1 | 39.2 | 7.1 | **S/ 238 (81 %)** |
| Enterprise | S/ 899 | 761.9 | 27.5 | 134.4 | 7.1 | **S/ 593 (78 %)** |

## 3. Competencia (precios públicos, septiembre 2026)

| Producto | Precio | Con IGV | Qué incluye |
| --- | --- | --- | --- |
| PANCA Básico | S/ 99 + IGV | S/ 116.8 | pedidos, carta digital, SUNAT, reportes básicos |
| PANCA Profesional | S/ 119 + IGV | S/ 140.4 | + inventario avanzado, food cost |
| Fudo (por local) | US$ 39 / 79 / 130 | ≈ S/ 134 / 272 / 447 | por **cada** sucursal |
| Restaurant.pe | S/ 350 – 450 | — | la facturación va en el plan alto |
| NIOPOS Lite | S/ 499 al año | ≈ S/ 42/mes | POS básico |
| Toteat corporativo | S/ 400+ y 0.3 % de las ventas | — | cadenas |
| **Wayra Básico** | **S/ 149** | **IGV incluido** | todo (KDS, delivery, inventario, recetas, offline, SUNAT) + **3 locales** |
| **Wayra Pro** | **S/ 349** | IGV incluido | hasta 11 locales + reportes consolidados |
| **Wayra Enterprise** | **S/ 899** | IGV incluido | locales ilimitados |

## 4. Veredicto

1. **Los precios actuales se sostienen:** cubren costos desde 16 clientes y dejan 65–78 %
   de margen operativo con SUNAT directo.
2. **Básico (S/ 149):** es S/ 32 más que PANCA Básico y S/ 9 más que PANCA Profesional,
   pero incluye todo y 3 locales. Pagando anual sale **S/ 124/mes**, por debajo de PANCA
   Profesional. Es competitivo si se comunica «todo incluido» y el precio anual.
3. **Pro (S/ 349):** es barato por local (S/ 27 con 11 locales frente a S/ 272 de Fudo por
   local). Hay espacio para subirlo sin perder competitividad.
4. **Enterprise (S/ 899 ilimitado) es el punto débil:** una cadena de 30 locales nos cuesta
   ~S/ 340 solo en soporte y deja apenas S/ 25 por local. Conviene un tope de locales
   incluidos y un precio por local adicional.
5. **Reglas para proteger el margen:**
   - SUNAT directo por defecto; el OSE siempre por cuenta del restaurante.
   - Incentivar el pago anual, Yape o transferencia (ahorra ~S/ 8 por cobro con tarjeta).
   - Cuando el soporte supere ~250 locales por persona, contratar antes de que baje la calidad.

## Fuentes

- Supabase: https://makerkit.dev/blog/saas/supabase-pricing
- Vercel: https://vercel.com/docs/pricing
- Sentry: https://middleware.io/blog/sentry-pricing/
- Resend: https://resend.com/docs/knowledge-base/what-is-resend-pricing
- Culqi: https://adratechsystems.com/recursos/izipay-vs-niubiz-vs-culqi-comparativa-peru
- Tipo de cambio: https://tucambista.pe/tipo-de-cambio-hoy
- Nubefact (OSE, mínimo S/ 40/mes): https://www.nubefact.com/precios
- SUNAT, certificado digital: https://cpe.sunat.gob.pe/certificado-digital
- PANCA: https://www.panca.pe/blog/cuanto-cuesta-sistema-pos-restaurante-peru/
- Fudo: https://madi-rest.com/blog/fudo-precio-2026
- Restaurant.pe: https://www.comparasoftware.pe/restaurant-pe
- NIOPOS: https://niopos.com/blog/cuanto-cuesta-facturacion-electronica-peru-2026
