# Wayra POS — Precios vs. costos reales y competencia (septiembre 2026)

Modelo reproducible: `python3 scripts/pricing/modelo.py`. Todos los supuestos están al
inicio del archivo; cámbialos y vuelve a correrlo.

## 1. Supuestos principales

| Supuesto | Valor | Fuente / criterio |
| --- | --- | --- |
| Tipo de cambio | S/ 3.44 por US$ | sept. 2026 |
| Mezcla de clientes | 60 % Básico · 30 % Pro · 10 % Enterprise | locales promedio: 1.3 / 3.5 / 12 |
| Régimen de la empresa | REMYPE pequeña empresa + Régimen MYPE Tributario | IR: 10 % hasta 15 UIT (S/ 82 500) de utilidad anual y 29.5 % sobre el exceso |
| Cargas laborales | +27 % sobre el sueldo | EsSalud 9 %, ½ gratificación, ½ CTS, 15 días de vacaciones, vida ley (en régimen general sería +45 %) |
| Comprobantes SUNAT | S/ 0 | SUNAT directo (SEE del contribuyente, certificado digital tributario gratuito); el OSE, si se usa, lo paga el restaurante |
| Pago con tarjeta | 60 % de los cobros | Culqi 4.20 % + US$ 0.30 + IGV; el resto con Yape, transferencia o pago anual |
| Morosidad | 3 % de la venta | |
| Clientes que se van | 3 % al mes | hay que reponerlos (2 h de puesta en marcha cada uno) |

## 2. Personal

| Puesto | Sueldo bruto | Costo empresa | Cuándo |
| --- | --- | --- | --- |
| **Responsable de soporte y puesta en marcha** | S/ 2 500 | **S/ 3 175** + S/ 600 de bono por noches y fines de semana | desde el día 1 |
| Asistente de soporte | S/ 1 800 | S/ 2 286 + bono | uno más cada ~250 locales |
| Desarrollador semi senior | S/ 6 500 | S/ 8 255 | desde ~60 clientes (antes, los fundadores) |
| Vendedor | S/ 1 500 + comisión (½ mes por cliente nuevo) | S/ 1 905 | desde ~90 clientes |
| Gerente / fundador | S/ 4 000 | S/ 5 080 | desde ~150 clientes |

Referencias de mercado: analista de soporte S/ 1 550–1 820, ingeniero de soporte en Lima
S/ 3 490, full stack semi senior S/ 6 500–8 500. Por encima del promedio de analista, porque
esta persona también capacita a los restaurantes y cubre horarios de servicio.

## 3. Otros gastos mensuales

| Concepto | Monto |
| --- | --- |
| Infraestructura (Supabase, Vercel, Sentry, correos, Workspace, dominio, respaldos) | S/ 380–460 hasta 100 clientes · ~S/ 1 050 de 100 a 400 clientes (incluye 18 % de IGV de no domiciliados) |
| Contador | S/ 500 |
| Internet y celulares | S/ 250 |
| Equipos: 3 laptops + tablet e impresora de demo (en 3 años) | S/ 333 |
| Legal: registro de marca en Indecopi (S/ 535) + abogado para textos legales (en 2 años) | S/ 85 |
| Herramientas (helpdesk, diseño, WhatsApp Business API) y banco | S/ 180 |
| Marketing digital | S/ 1 500 al arrancar · S/ 3 000 con equipo |
| Oficina / coworking | S/ 0 remoto · S/ 600 con equipo completo |
| Contingencia | +10 % sobre todos los gastos fijos |

## 4. Resultados con los precios actuales (S/ 149 / 349 / 899)

**A) Arranque:** solo el responsable de soporte en planilla; los fundadores programan y venden
sin sueldo.

| Clientes | Venta neta | Costos | Utilidad después de IR | Margen |
| --- | --- | --- | --- | --- |
| 25 | S/ 6 017 | S/ 8 139 | −S/ 2 122 | −35 % |
| 50 | S/ 12 034 | S/ 8 668 | S/ 3 030 | 25 % |
| 100 | S/ 24 068 | S/ 12 722 | S/ 9 340 | 39 % |
| 300 | S/ 72 203 | S/ 23 235 | S/ 35 863 | 50 % |

→ **Equilibrio: 35 clientes.**

**B) Equipo completo desde el inicio:** soporte, desarrollador, vendedor y sueldo del fundador.

| Clientes | Venta neta | Utilidad después de IR | Margen |
| --- | --- | --- | --- |
| 100 | S/ 24 068 | −S/ 8 089 | −34 % |
| 150 | S/ 36 102 | S/ 2 014 | 6 % |
| 200 | S/ 48 136 | S/ 8 417 | 17 % |
| 300 | S/ 72 203 | S/ 21 652 | 30 % |
| 500 | S/ 120 339 | S/ 45 727 | 38 % |

→ **Equilibrio: 140 clientes.**

**C) Recomendado: contratar por etapas.** Soporte desde el día 1, desarrollador desde 60
clientes, vendedor desde 90 y sueldo del fundador desde 150.

| Ritmo | Mes 12 | Mes 24 | Capital de trabajo necesario | Rentable con equipo completo |
| --- | --- | --- | --- | --- |
| 10 clientes nuevos al mes | 102 clientes | 173 clientes · +S/ 3 700/mes | ~S/ 11 000 | desde el mes 20 |
| 15 clientes nuevos al mes | 153 clientes | 259 clientes · +S/ 15 300/mes | ~S/ 5 400 | desde el mes 12 |

A eso se suma la inversión inicial (laptops, equipo de demo, marca, abogado y constitución),
unos **S/ 15 000**, que en el modelo está repartida mes a mes.

## 5. ¿Y si cambiamos los precios?

Clientes necesarios para cubrir costos:

| Precios (Básico / Pro / Enterprise) | Arranque | Equipo completo | Utilidad con 300 clientes (equipo) |
| --- | --- | --- | --- |
| **Actual 149 / 349 / 899** | **35** | **140** | **S/ 21 652** |
| 129 / 349 / 899 | 37 | 147 | S/ 19 674 |
| 119 / 299 / 799 | 41 | 183 | S/ 14 562 |
| 169 / 399 / 999 | 31 | 124 | S/ 27 753 |

- Bajar Básico a S/ 129 casi no cambia el equilibrio. Bajar todo (119/299/799) exige
  **43 clientes más** para cubrir el equipo completo.
- Subir a 169/399/999 mejora el margen, pero deja el Básico S/ 29–52 por encima de PANCA.
- **Si nosotros pagáramos el OSE, el equilibrio con equipo completo saltaría a 365 clientes.**

## 6. Competencia

| Producto | Precio con IGV | Nota |
| --- | --- | --- |
| PANCA Básico / Profesional | S/ 116.8 / 140.4 | un local; no cobra por comprobante |
| Fudo | ≈ S/ 134 / 272 / 447 | por **cada** local |
| Restaurant.pe | S/ 350–450 | |
| NIOPOS Lite | ≈ S/ 42 al mes (S/ 499 al año) | POS básico |
| Toteat corporativo | S/ 400+ y 0.3 % de las ventas | cadenas |
| **Wayra** | **S/ 149 / 349 / 899** | todo incluido; Básico con 3 locales; anual = 2 meses gratis |

## 7. Veredicto

1. **Mantener S/ 149 / 349 / 899.** Con sueldos y cargas reales, son los precios que
   permiten sostener un equipo con unos 140 clientes sin salir del rango del mercado.
2. **Crecer por etapas.** El responsable de soporte desde el día 1; el desarrollador y el
   vendedor recién desde 60 y 90 clientes. Así el capital de trabajo necesario es de
   S/ 5 000–11 000.
3. **Enterprise con tope:** S/ 899 hasta 25 locales + S/ 29 por local adicional. Una cadena
   grande consume soporte y hoy deja S/ 25 por local.
4. **Proteger el margen:**
   - SUNAT directo por defecto; el OSE a cargo del restaurante.
   - Empujar el pago anual o con Yape (se ahorra ~S/ 8.60 por cobro con tarjeta).
   - Contratar un asistente de soporte cada ~250 locales.
5. **Para competir con PANCA sin bajar precios:** destacar «todo incluido», «3 locales en
   Básico», «funciona sin internet» y «S/ 124 al mes pagando anual».

## Fuentes

- Sueldos de soporte: https://pe.computrabajo.com/salarios/analista-de-soporte ·
  https://pe.indeed.com/career/ingeniero-de-soporte-t%C3%A9cnico/salaries/Lima--Lima
- Sueldos de desarrollo: https://catalizadora.ai/blog/desarrollo-de-software-sueldo-peru
- Cargas laborales y REMYPE: https://facturasimple.com/pe/blog/pe-costo-laboral-empleado-regimen-mype ·
  https://www.yosoymentoria.com/blog/details/cts-y-remype-2026-cuanto-toca-pagar-o-cobrar-realmente/815
- RMV y UIT 2026: https://knowmygovt.com/peru/uit-rmv/
- Registro de marca: https://perugestiona.pe/emprendimiento/marca-indecopi/
- WhatsApp Business API: https://www.simla.com/blog/precios-whatsapp-business-api
- Supabase: https://makerkit.dev/blog/saas/supabase-pricing · Vercel: https://vercel.com/docs/pricing ·
  Sentry: https://middleware.io/blog/sentry-pricing/ · Resend: https://resend.com/docs/knowledge-base/what-is-resend-pricing
- Culqi: https://adratechsystems.com/recursos/izipay-vs-niubiz-vs-culqi-comparativa-peru
- Tipo de cambio: https://tucambista.pe/tipo-de-cambio-hoy
- SUNAT, certificado digital: https://cpe.sunat.gob.pe/certificado-digital · Nubefact: https://www.nubefact.com/precios
- Competencia: https://www.panca.pe/blog/cuanto-cuesta-sistema-pos-restaurante-peru/ ·
  https://madi-rest.com/blog/fudo-precio-2026 · https://www.comparasoftware.pe/restaurant-pe ·
  https://niopos.com/blog/cuanto-cuesta-facturacion-electronica-peru-2026
