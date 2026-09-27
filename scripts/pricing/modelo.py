# Modelo de costos y márgenes de Wayra POS (ver PRECIOS.md).
# Uso: python3 scripts/pricing/modelo.py
# Todos los montos en soles (S/) por mes. Edita los SUPUESTOS y vuelve a correrlo.
import math

# ─────────────────────────── SUPUESTOS ───────────────────────────
TC = 3.44          # soles por dólar (sept. 2026)
IGV = 0.18
UIT = 5500         # 2026

# Cargas laborales sobre el sueldo bruto, REMYPE pequeña empresa:
# EsSalud 9 % + ½ gratificación (+9 %) + ½ CTS + 15 días de vacaciones + vida ley.
CARGA_LABORAL = 0.27

# Realidad peruana: la gran mayoría de restaurantes tiene un solo local y casi
# ninguno pasa de 4. precio = con IGV e incluye `incluidos` locales; cada local
# adicional suma `extra`. locales = promedio por cliente; mezcla = % de clientes.
PLANES = {
    "Básico":     dict(precio=159, incluidos=1, extra=0,   locales=1.0, mezcla=0.80),
    "Pro":        dict(precio=299, incluidos=2, extra=119, locales=2.6, mezcla=0.17),
    "Enterprise": dict(precio=899, incluidos=6, extra=99,  locales=8.0, mezcla=0.03),
}

COMPROBANTES_POR_LOCAL = 1800   # al mes (~60 al día)
COSTO_POR_COMPROBANTE = 0.0     # 0 con SUNAT directo; ~0.02 si pagáramos un OSE
PAGO_CON_TARJETA = 0.6          # el resto paga con Yape/transferencia o anual
MOROSIDAD = 0.03                # cobros que no se recuperan
CHURN_MENSUAL = 0.03            # clientes que se van cada mes (hay que reponerlos)
COMISION_VENTA = 0.5            # fracción del primer mes que gana el vendedor por cliente nuevo
LOCALES_POR_AGENTE = 250        # locales que atiende una persona de soporte

# Personal (sueldo bruto mensual)
SUELDO_RESPONSABLE_SOPORTE = 2500  # lidera soporte y puesta en marcha
SUELDO_ASISTENTE_SOPORTE = 1800    # uno más cada LOCALES_POR_AGENTE locales
GUARDIA_FINDE_NOCHE = 600          # bono por cubrir noches y fines de semana (los restaurantes trabajan ahí)
SUELDO_DESARROLLADOR = 6500        # semi senior: mantenimiento, SUNAT, mejoras
SUELDO_VENDEDOR = 1500             # base (más comisión)
SUELDO_GERENTE = 4000              # sueldo del fundador / gerente general

# Otros gastos fijos
CONTADOR = 500
INTERNET_CELULARES = 250
EQUIPOS = (3 * 3500 + 1500) / 36   # 3 laptops + tablet e impresora térmica de demo, en 3 años
LEGAL = (535 + 1500) / 24          # registro de marca Indecopi + abogado para textos legales, en 2 años
HERRAMIENTAS = 150                 # helpdesk, diseño, WhatsApp Business API, varios
BANCO = 30
CONTINGENCIA = 0.10                # sobre los gastos fijos

# ─────────────────────── ESCENARIOS DE EQUIPO ───────────────────────
ESCENARIOS = {
    # Los fundadores programan y venden sin sueldo; se contrata al responsable de soporte desde el día 1.
    "Arranque": dict(dev=False, vendedor=False, gerente=False, marketing=1500, oficina=0),
    # Equipo completo con sueldos de mercado para todos, incluido el fundador.
    "Equipo completo": dict(dev=True, vendedor=True, gerente=True, marketing=3000, oficina=600),
}


def precio_cliente(d):
    """Mensualidad promedio de un cliente del plan: precio + locales adicionales."""
    return d["precio"] + max(0.0, d["locales"] - d.get("incluidos", 1)) * d.get("extra", 0)


def infra_usd(n):
    usd = 25 + (5 if n <= 100 else 50 if n <= 400 else 100)  # Supabase Pro + cómputo
    usd += 100 if n > 100 else 0                              # PITR 7 días
    usd += 20 + 26 + (20 if n >= 50 else 0) + 14.4 + 1.25 + 1  # Vercel, Sentry, Resend, Workspace, dominio, R2
    return usd


def costo(sueldo):
    return sueldo * (1 + CARGA_LABORAL)


def run(n, esc, planes=PLANES, cpe=None):
    cpe = COSTO_POR_COMPROBANTE if cpe is None else cpe
    e = ESCENARIOS[esc]
    clientes = {p: n * d["mezcla"] for p, d in planes.items()}
    locales = sum(clientes[p] * d["locales"] for p, d in planes.items())
    bruto = sum(clientes[p] * precio_cliente(d) for p, d in planes.items())
    neto = bruto / (1 + IGV)

    # Variables
    pasarela = sum(clientes[p] * PAGO_CON_TARJETA * (precio_cliente(d) * 0.042 + 0.30 * TC) * (1 + IGV) for p, d in planes.items())
    comprobantes = locales * COMPROBANTES_POR_LOCAL * cpe
    morosidad = neto * MOROSIDAD
    nuevos = n * CHURN_MENSUAL  # solo para reponer bajas; el crecimiento se paga con marketing
    comisiones = nuevos * COMISION_VENTA * neto / max(n, 1) if e["vendedor"] else 0
    puesta_en_marcha = nuevos * 2 * costo(SUELDO_RESPONSABLE_SOPORTE) / 160  # 2 h por cliente nuevo
    variables = pasarela + comprobantes + morosidad + comisiones + puesta_en_marcha

    # Personal
    agentes_extra = max(0, math.ceil(locales / LOCALES_POR_AGENTE) - 1)
    soporte = costo(SUELDO_RESPONSABLE_SOPORTE) + agentes_extra * costo(SUELDO_ASISTENTE_SOPORTE) + GUARDIA_FINDE_NOCHE * (1 + agentes_extra)
    otros_sueldos = (costo(SUELDO_DESARROLLADOR) if e["dev"] else 0) + (costo(SUELDO_VENDEDOR) if e["vendedor"] else 0) + (costo(SUELDO_GERENTE) if e["gerente"] else 0)

    infra = infra_usd(n) * TC * (1 + IGV)  # IGV de no domiciliados (recuperable; lo contamos como costo)
    admin = CONTADOR + INTERNET_CELULARES + EQUIPOS + LEGAL + HERRAMIENTAS + BANCO + e["oficina"]
    fijos = (infra + soporte + otros_sueldos + admin + e["marketing"]) * (1 + CONTINGENCIA)

    antes_ir = neto - variables - fijos
    anual = antes_ir * 12
    ir = 0 if anual <= 0 else (min(anual, 15 * UIT) * 0.10 + max(0, anual - 15 * UIT) * 0.295) / 12  # Régimen MYPE Tributario
    return dict(n=n, locales=locales, bruto=bruto, neto=neto, variables=variables, soporte=soporte,
                otros_sueldos=otros_sueldos, infra=infra, admin=admin + e["marketing"], fijos=fijos,
                antes_ir=antes_ir, ir=ir, utilidad=antes_ir - ir)


def equilibrio(esc, planes=PLANES, cpe=None):
    n = 1
    while run(n, esc, planes, cpe)["antes_ir"] < 0 and n < 5000:
        n += 1
    return n


if __name__ == "__main__":
    for esc in ESCENARIOS:
        print(f"\n══ Escenario: {esc} (equilibrio: {equilibrio(esc)} clientes)")
        print(f"{'clientes':>8} {'locales':>7} {'neto':>8} {'variable':>8} {'soporte':>8} {'sueldos':>8} {'infra':>6} {'admin+mkt':>9} {'antes IR':>9} {'IR':>6} {'utilidad':>9} {'margen':>6}")
        for n in (25, 50, 100, 150, 200, 300, 500):
            r = run(n, esc)
            print(f"{n:>8} {r['locales']:>7.0f} {r['neto']:>8,.0f} {r['variables']:>8,.0f} {r['soporte']:>8,.0f} {r['otros_sueldos']:>8,.0f} {r['infra']:>6,.0f} {r['admin']:>9,.0f} {r['antes_ir']:>9,.0f} {r['ir']:>6,.0f} {r['utilidad']:>9,.0f} {r['utilidad'] / r['neto']:>6.0%}")

    print("\n══ Costo mensual del personal (sueldo → costo empresa con cargas REMYPE)")
    for nombre, s in [("Responsable de soporte", SUELDO_RESPONSABLE_SOPORTE), ("Asistente de soporte", SUELDO_ASISTENTE_SOPORTE),
                      ("Desarrollador", SUELDO_DESARROLLADOR), ("Vendedor (base)", SUELDO_VENDEDOR), ("Gerente / fundador", SUELDO_GERENTE)]:
        print(f"  {nombre:24} S/ {s:>6,} → S/ {costo(s):>7,.0f}")

    print("\n══ Sensibilidad: clientes para cubrir costos según precios")
    def variante(basico, pro, ent):
        return {"Básico": {**PLANES["Básico"], "precio": basico},
                "Pro": {**PLANES["Pro"], "precio": pro[0], "extra": pro[1]},
                "Enterprise": {**PLANES["Enterprise"], "precio": ent[0], "extra": ent[1]}}
    alternativas = {
        "Anterior 149 (3 locales)": {"Básico": dict(precio=149, incluidos=3, extra=0, locales=1.0, mezcla=0.80),
                                     "Pro": dict(precio=349, incluidos=11, extra=0, locales=2.6, mezcla=0.17),
                                     "Enterprise": dict(precio=899, incluidos=25, extra=29, locales=8.0, mezcla=0.03)},
        "Básico 149 · Pro 279+109": variante(149, (279, 109), (849, 99)),
        "Básico 159 · Pro 299+119": PLANES,
        "Básico 169 · Pro 319+129": variante(169, (319, 129), (949, 109)),
    }
    for nombre, pl in alternativas.items():
        print(f"  {nombre:24} arranque {equilibrio('Arranque', pl):>4} · equipo completo {equilibrio('Equipo completo', pl):>4}"
              f" · utilidad con 300 clientes (equipo): S/ {run(300, 'Equipo completo', pl)['utilidad']:>7,.0f}")
    print(f"\n  Si pagáramos el OSE (S/ 0.02 por comprobante): equilibrio con equipo completo = {equilibrio('Equipo completo', cpe=0.02)} clientes")


def plan_por_etapas(nuevos_por_mes=10, meses=36):
    """Contratar a medida que se crece: soporte desde el día 1, desarrollador desde 100
    clientes, vendedor desde 130 y sueldo del fundador desde 180 (con 80 % de clientes
    de un solo local, el ingreso por cliente es menor y conviene esperar más)."""
    n, caja, peor, mes_eq = 0, 0.0, 0.0, None
    filas = []
    for m in range(1, meses + 1):
        n = n * (1 - CHURN_MENSUAL) + nuevos_por_mes
        ESCENARIOS["_etapa"] = dict(dev=n >= 100, vendedor=n >= 130, gerente=n >= 180,
                                    marketing=1500 if n < 130 else 3000, oficina=0 if n < 180 else 600)
        r = run(round(n), "_etapa")
        caja += r["utilidad"]
        peor = min(peor, caja)
        if mes_eq is None and r["antes_ir"] > 0 and n >= 180:
            mes_eq = m
        if m in (6, 12, 18, 24, 36):
            filas.append((m, round(n), r["utilidad"], caja))
    del ESCENARIOS["_etapa"]
    return filas, peor, mes_eq


if __name__ == "__main__":
    for ritmo in (10, 15):
        filas, peor, mes_eq = plan_por_etapas(ritmo)
        print(f"\n══ Crecimiento por etapas: {ritmo} clientes nuevos al mes (churn {CHURN_MENSUAL:.0%})")
        for m, n, u, c in filas:
            print(f"  mes {m:>2}: {n:>3} clientes · resultado del mes S/ {u:>8,.0f} · acumulado S/ {c:>9,.0f}")
        print(f"  Capital necesario (peor momento de caja): S/ {-peor:,.0f}"
              + (f" · rentable con equipo completo desde el mes {mes_eq}" if mes_eq else ""))
