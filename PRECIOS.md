# Wayra POS — Precios vs. costos reales y competencia (septiembre 2026)

Modelo reproducible: `python3 scripts/pricing/modelo.py`. Todos los supuestos están al
inicio del archivo; cámbialos y vuelve a correrlo.

## 1. Supuestos principales

| Supuesto | Valor | Fuente / criterio |
| --- | --- | --- |
| Tipo de cambio | S/ 3.44 por US$ | sept. 2026 |
| Mezcla de clientes | 80 % Básico · 17 % Pro · 3 % Enterprise | realidad peruana: casi todos tienen 1 local y muy pocos pasan de 4. Locales promedio: 1 / 2.6 / 8 |
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
| Desarrollador semi senior | S/ 6 500 | S/ 8 255 | desde ~100 clientes (antes, los fundadores) |
| Vendedor | S/ 1 500 + comisión (½ mes por cliente nuevo) | S/ 1 905 | desde ~130 clientes |
| Gerente / fundador | S/ 4 000 | S/ 5 080 | desde ~180 clientes |

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

## 4. Estructura de planes (vigente)

Premisa: en el Perú casi todos los restaurantes tienen **un solo local** y muy pocos pasan
de 4. Por eso el precio se arma por local: el Básico cubre al restaurante típico y los
demás planes crecen con cada local.

| Plan | Precio con IGV | Locales | Local adicional | Pago anual (10 meses) |
| --- | --- | --- | --- | --- |
| **Básico** | **S/ 159** | 1 | — | S/ 1 590 (S/ 132.50/mes) |
| **Pro** | **S/ 299** | 2 incluidos, hasta 5 | + S/ 119/mes | S/ 2 990 (S/ 249/mes) |
| **Enterprise** | **S/ 899** | 6 incluidos, sin tope | + S/ 99/mes | S/ 8 990 (S/ 749/mes) |

Cuánto paga un restaurante según sus locales:

| Locales | Wayra | PANCA (Básico / Profesional, por local) | Fudo (por local) |
| --- | --- | --- | --- |
| 1 | **S/ 159** (Básico) | S/ 117 / 140 | S/ 134–272 |
| 2 | **S/ 299** (Pro) | S/ 234 / 281 | S/ 268–544 |
| 3 | **S/ 418** (Pro) | S/ 351 / 421 | S/ 402–816 |
| 4 | **S/ 537** (Pro) | S/ 468 / 562 | S/ 536–1 088 |
| 5 | **S/ 656** (Pro) | S/ 585 / 702 | S/ 670–1 360 |
| 8 | **S/ 1 097** (Enterprise) | S/ 936 / 1 123 | S/ 1 072–2 176 |

- Con 1 local somos S/ 19 más que PANCA Profesional; pagando anual (S/ 132.50), S/ 8 menos.
- Desde 2 locales quedamos entre el Básico y el Profesional de PANCA, pero con todo incluido
  (cocina, delivery, inventario con recetas, reportes consolidados, sin internet, SUNAT sin
  costo por comprobante).
- Cada local nuevo cuesta menos que el anterior (S/ 159 → S/ 119 → S/ 99): premia crecer.

## 5. Resultados con estos precios

**A) Arranque:** solo el responsable de soporte en planilla; los fundadores programan y venden
sin sueldo.

| Clientes | Locales | Venta neta | Utilidad después de IR | Margen |
| --- | --- | --- | --- | --- |
| 50 | 74 | S/ 9 452 | S/ 857 | 9 % |
| 100 | 148 | S/ 18 905 | S/ 8 175 | 43 % |
| 300 | 445 | S/ 56 715 | S/ 30 130 | 53 % |

→ **Equilibrio: 45 clientes.**

**B) Equipo completo desde el inicio:** soporte, desarrollador, vendedor y sueldo del fundador.

| Clientes | Venta neta | Utilidad después de IR | Margen |
| --- | --- | --- | --- |
| 150 | S/ 28 357 | −S/ 1 712 | −6 % |
| 200 | S/ 37 810 | S/ 3 342 | 9 % |
| 300 | S/ 56 715 | S/ 16 083 | 28 % |
| 500 | S/ 94 525 | S/ 37 938 | 40 % |

→ **Equilibrio: 160 clientes.**

**C) Recomendado: contratar por etapas.** Soporte desde el día 1, desarrollador desde 100
clientes, vendedor desde 130 y sueldo del fundador desde 180.

| Ritmo | Mes 12 | Mes 24 | Capital de trabajo necesario | Rentable con equipo completo |
| --- | --- | --- | --- | --- |
| 10 clientes nuevos al mes | 102 clientes | 173 clientes · +S/ 4 786/mes | ~S/ 14 000 | desde el mes 26 |
| 15 clientes nuevos al mes | 153 clientes | 259 clientes · +S/ 11 112/mes | ~S/ 7 500 | desde el mes 15 |

Más la inversión inicial de unos S/ 15 000 (laptops, equipo de demo, marca, abogado y
constitución), que en el modelo está repartida mes a mes.

## 6. Comparación de estructuras (misma mezcla realista)

| Estructura | Equilibrio: arranque | Equilibrio: equipo completo | Utilidad con 300 clientes |
| --- | --- | --- | --- |
| Anterior: Básico S/ 149 con 3 locales | 48 | 194 | S/ 13 185 |
| Básico 149 · Pro 279 + 109 | 48 | 191 | S/ 13 788 |
| **Básico 159 · Pro 299 + 119 (vigente)** | **45** | **160** | **S/ 16 083** |
| Básico 169 · Pro 319 + 129 | 42 | 151 | S/ 18 477 |

- Con la mezcla realista, la estructura anterior regalaba sucursales que casi nadie usa y
  necesitaba 194 clientes. La nueva baja el equilibrio a 160.
- S/ 169 mejoraría algo más el margen, pero dejaría el Básico S/ 29 por encima de PANCA
  Profesional. S/ 159 es el punto de equilibrio entre margen y competitividad.
- **Si nosotros pagáramos el OSE, el equilibrio con equipo completo subiría a 259 clientes**:
  SUNAT directo sigue siendo clave.

## 7. Aplicado (28/09/2026)

- Planes en la base (migración `0045`), la app, la consola SaaS, la landing y los Términos
  (versión 2026-10):
  - Básico: 1 local. Al intentar abrir una sucursal: «Tu plan Básico es para un solo local.
    Pasa al plan Pro».
  - Pro y Enterprise: la app avisa «+ S/ 119» o «+ S/ 99 al mes» antes de crear un local
    adicional, y la pantalla Plan muestra el desglose.
  - El MRR, el cobro mensual automático y los cobros manuales de la consola SaaS suman los
    locales adicionales.
- Clientes que ya tenían sucursales en Básico: las conservan (no se desactiva nada), pero
  para abrir más deben pasar a Pro.
- **Antes de aplicar a clientes existentes:** avisarles por correo con 30 días de
  anticipación (sube el Básico de S/ 149 a S/ 159 y cambian los locales incluidos), como
  exigen los Términos y la norma de protección al consumidor.

## 8. Reglas para proteger el margen

1. SUNAT directo por defecto; el OSE siempre a cargo del restaurante.
2. Empujar el pago anual, Yape o transferencia (se ahorra ~S/ 9 por cobro con tarjeta).
3. Contratar por etapas y sumar un asistente de soporte cada ~250 locales.
4. Mensaje comercial: «todo incluido para tu local por S/ 159, S/ 132.50 pagando anual, sin
   costo por comprobante y funciona sin internet».

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
