# Economía por cliente de los planes de comedor (ver PRECIOS.md, sección 9).
# Uso: python3 scripts/pricing/comedor.py
# Reutiliza los supuestos de modelo.py (cargas laborales, tipo de cambio, IGV,
# pasarela). Montos en soles por mes.
import importlib.util
import pathlib

_spec = importlib.util.spec_from_file_location("modelo", pathlib.Path(__file__).with_name("modelo.py"))
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

# Hora de soporte: responsable de soporte con cargas y bono de horario extendido.
HORA_SOPORTE = (m.costo(m.SUELDO_RESPONSABLE_SOPORTE) + m.GUARDIA_FINDE_NOCHE) / 160

# precio con IGV · comensales típicos · horas de puesta en marcha (una vez:
# padrón, capacitación, familias) · horas de soporte al mes (recargas, padres,
# cierre de mes) · infraestructura marginal (base de datos, portal, correos).
PLANES = {
    "Comedor":               dict(precio=249, comensales=250,  puesta=6,  soporte=3,  infra=8),
    "Comedor Pro":           dict(precio=449, comensales=800,  puesta=12, soporte=6,  infra=15),
    "Comedor Institucional": dict(precio=899, comensales=2600, puesta=30, soporte=16, infra=40),
}
EXTRA_100 = 35          # Institucional: por cada 100 comensales sobre 2 000
INCLUIDOS_INST = 2000
VIDA_MESES = 12         # la puesta en marcha se amortiza en un año escolar (conservador)
MESES_CON_CLASES = 10   # el pago anual (10 meses) cubre el año escolar

# Ventas típicas de un comedor escolar: menú + kiosko por alumno y día de clases.
TICKET_DIA = 15
DIAS_MES = 20


def mensualidad(plan, d):
    extra = 0
    if plan == "Comedor Institucional":
        extra = -(-max(0, d["comensales"] - INCLUIDOS_INST) // 100) * EXTRA_100
    return d["precio"] + extra


if __name__ == "__main__":
    print(f"Hora de soporte: S/ {HORA_SOPORTE:,.2f}\n")
    print(f"{'plan':24} {'mensual':>8} {'neto':>7} {'pasarela':>8} {'soporte':>8} {'puesta':>7} {'infra':>6} {'contrib.':>9} {'margen':>7} {'S/ x comensal':>13} {'% ventas':>8}")
    for plan, d in PLANES.items():
        total = mensualidad(plan, d)
        neto = total / (1 + m.IGV)
        pasarela = m.PAGO_CON_TARJETA * (total * 0.042 + 0.30 * m.TC) * (1 + m.IGV)
        soporte = d["soporte"] * HORA_SOPORTE
        puesta = d["puesta"] * HORA_SOPORTE / VIDA_MESES
        contrib = neto - pasarela - soporte - puesta - d["infra"]
        ventas = d["comensales"] * TICKET_DIA * DIAS_MES
        print(f"{plan:24} {total:>8,.0f} {neto:>7,.0f} {pasarela:>8,.1f} {soporte:>8,.0f} {puesta:>7,.0f} {d['infra']:>6} {contrib:>9,.0f} {contrib / neto:>7.0%}"
              f" {total / d['comensales']:>13,.2f} {total / ventas:>8.2%}")

    basico = m.PLANES["Básico"]
    neto_b = basico["precio"] / (1 + m.IGV)
    contrib_b = neto_b - m.PAGO_CON_TARJETA * (basico["precio"] * 0.042 + 0.30 * m.TC) * (1 + m.IGV) - 1.5 * HORA_SOPORTE - 6
    print(f"\nReferencia restaurante Básico (1.5 h de soporte, S/ 6 de infra): contribución ≈ S/ {contrib_b:,.0f}")
    print(f"Un comedor escolar de 250 alumnos vende ≈ S/ {250 * TICKET_DIA * DIAS_MES:,.0f} al mes; una comisión hipotética de 3 % costaría S/ {250 * TICKET_DIA * DIAS_MES * 0.03:,.0f}.")
