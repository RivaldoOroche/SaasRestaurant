# Modelo de costos y márgenes de Wayra POS (ver PRECIOS.md). Uso: python3 scripts/pricing/modelo.py
# Edita los supuestos de arriba (tipo de cambio, mezcla de planes, locales por cliente, costo por comprobante).
import math
TC=3.44; IGV=0.18
PLANS={"Básico":dict(price=149,loc=1.3,share=0.6),"Pro":dict(price=349,loc=3.5,share=0.3),"Enterprise":dict(price=899,loc=12,share=0.1)}
CPE_PER_LOCAL=1800  # comprobantes/mes por local (60/día)
def fixed(n, locales):
    usd = 25 + (5 if n<=100 else 50 if n<=400 else 100)   # Supabase Pro + cómputo
    usd += 100 if n>100 else 0                            # PITR 7 días
    usd += 20 + 26 + (20 if n>=50 else 0) + 14.4 + 1.25 + 1  # Vercel, Sentry, Resend, Workspace, dominio, R2
    pen = usd*TC*(1+IGV)  # servicios no domiciliados: IGV (crédito fiscal, lo contamos como costo conservador)
    agents = max(1, math.ceil(locales/250))
    support = agents*2800
    return pen, support, 400  # infra, soporte, contador
def gateway(price, card_share=0.6):
    fee=(price*0.042+0.30*TC)*(1+IGV)
    return card_share*fee
def run(n, cpe_cost=0.0, mix=None, label=""):
    mix = mix or PLANS
    rev_gross=rev_net=var=0; loc=0
    for p,d in mix.items():
        t=n*d["share"]; loc+=t*d["loc"]
        rev_gross+=t*d["price"]; rev_net+=t*d["price"]/(1+IGV)
        var+=t*(gateway(d["price"]) + d["loc"]*CPE_PER_LOCAL*cpe_cost + 60/24)  # pasarela, OSE, onboarding amortizado
    infra,sup,cont=fixed(n,loc)
    cost=infra+sup+cont+var
    profit=rev_net-cost
    return dict(n=n,loc=round(loc),gross=rev_gross,net=rev_net,infra=infra,sup=sup,var=var,cost=cost,profit=profit,margin=profit/rev_net)
for cpe in (0.0,0.02):
    print(f"\n== Comprobantes: S/ {cpe:.2f} c/u ({'SUNAT directo' if cpe==0 else 'OSE'})")
    print(f"{'rest.':>6} {'locales':>7} {'venta c/IGV':>11} {'neto':>9} {'infra':>7} {'soporte':>8} {'variable':>9} {'utilidad':>9} {'margen':>7}")
    for n in (10,25,50,100,200,300,500):
        r=run(n,cpe)
        print(f"{r['n']:>6} {r['loc']:>7} {r['gross']:>11,.0f} {r['net']:>9,.0f} {r['infra']:>7,.0f} {r['sup']:>8,.0f} {r['var']:>9,.0f} {r['profit']:>9,.0f} {r['margin']:>7.0%}")
# break-even
for cpe in (0.0,0.02):
    n=1
    while run(n,cpe)['profit']<0: n+=1
    print(f"Punto de equilibrio (CPE {cpe}): {n} restaurantes")
# unit economics per plan
print("\n== Por cliente (100 clientes, SUNAT directo)")
for p,d in PLANS.items():
    net=d['price']/1.18; g=gateway(d['price']); sup=2800/250*d['loc']; inf=fixed(100,1)[0]/100; ose=d['loc']*CPE_PER_LOCAL*0.02
    print(f"{p:10} precio {d['price']:>4} neto {net:6.1f} pasarela {g:5.1f} soporte {sup:5.1f} infra {inf:4.1f} onboarding 2.5 → contribución {net-g-sup-inf-2.5:6.1f} ({(net-g-sup-inf-2.5)/net:.0%}); con OSE -{ose:.0f} → {net-g-sup-inf-2.5-ose:6.1f}")
# per-local price comparison
print("\n== Precio por local (neto sin IGV)")
for p,d in PLANS.items():
    print(f"{p}: S/ {d['price']/1.18/d['loc']:.0f} por local promedio; en el tope de sucursales: S/ {d['price']/1.18/({'Básico':3,'Pro':11,'Enterprise':30}[p]):.0f}")
print("\n== Con equipo y marketing (S/ 10,000 fijos extra: 2 sueldos S/ 4,000 + S/ 2,000 marketing)")
for cpe in (0.0,0.02):
    n=1
    while run(n,cpe)['profit']<10000: n+=1
    print(f"Equilibrio (CPE {cpe}): {n} restaurantes")
# enterprise chain of 30 locales
d=dict(price=899,loc=30); net=899/1.18; sup=2800/250*30
print(f"\nCadena de 30 locales en Enterprise: neto {net:.0f}, soporte {sup:.0f}, OSE si lo pagáramos {30*1800*0.02:.0f}")
