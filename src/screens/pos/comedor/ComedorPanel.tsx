// Inicio del comedor: cómo va el día (menús, reservas, kiosko, caja), avisos
// (saldos bajos, menú sin publicar) y la guía de primeros pasos.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import {
  useCashSessions,
  useComedorMenus,
  useComensales,
  useConsumos,
  useMenuItems,
  useReservas,
  useResponsables,
  useSettings,
} from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney, round2 } from "@/lib/money";
import { localDate, nextSchoolDays } from "@/lib/comedor";
import { cn } from "@/lib/cn";

export function ComedorPanel() {
  const { session } = useAuth();
  const today = localDate();
  const next = nextSchoolDays(new Date(), 5);
  const monthAgo = localDate(new Date(Date.now() - 30 * 864e5));
  const { data: settings } = useSettings();
  const { data: comensales = [] } = useComensales();
  const { data: responsables = [] } = useResponsables();
  const { data: items = [] } = useMenuItems();
  const { data: menus = [] } = useComedorMenus(today, next[next.length - 1]);
  const { data: reservas = [] } = useReservas(today, today);
  const { data: consumos = [] } = useConsumos(monthAgo, today);
  const { data: cash = [] } = useCashSessions();

  const hoy = consumos.filter((k) => k.date === today);
  const menusHoy = hoy.filter((k) => k.kind === "menu");
  const served = new Set(menusHoy.map((k) => k.comensalId));
  const menuHoy = menus.find((m) => m.date === today);
  const minimo = settings?.saldoMinimo ?? 10;
  const bajos = comensales.filter((c) => c.active && c.plan !== "convenio" && c.balance < minimo).length;
  const sinMenu = next.filter((d) => !menus.some((m) => m.date === d));
  const openCash = cash.find((c) => c.status === "abierta");

  const steps = [
    { key: "datos", title: "Completa los datos del concesionario", hint: "RUC y razón social para tus boletas.", to: "/pos/ajustes", done: !!settings?.ruc && !!settings?.razonSocial },
    { key: "kiosko", title: "Arma la carta del kiosko", hint: "Productos saludables y precios; marca los octógonos.", to: "/pos/editor", done: items.length > 0 },
    { key: "padron", title: "Importa el padrón", hint: "Pega la lista de alumnos y docentes desde Excel.", to: "/pos/comensales", done: comensales.length > 0 },
    { key: "familias", title: "Envía los enlaces a las familias", hint: "Cada familia ve saldo, consumos y reserva el menú.", to: "/pos/comensales", done: responsables.length > 0 },
    { key: "menu", title: "Publica el menú de la semana", hint: "Con raciones y alérgenos: las familias reservan.", to: "/pos/menu-dia", done: menus.length > 0 },
    { key: "pagos", title: "Configura Yape y Plin", hint: "Las familias recargan al número del comedor.", to: "/pos/ajustes", done: !!settings?.yapeNumber || !!settings?.plinNumber },
    { key: "caja", title: "Abre la caja", hint: "Para recibir recargas y ventas en efectivo.", to: "/pos/caja", done: cash.length > 0 },
    { key: "despacho", title: "Haz el primer despacho", hint: "Despacho → busca al alumno → Entregar menú.", to: "/pos/despacho", done: consumos.length > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const hideKey = `wayra-setup-hidden:${session?.tenantId ?? ""}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(hideKey) === "1";
    } catch {
      return false;
    }
  });
  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader title={`Hola${session?.staff?.name ? `, ${session.staff.name.split(" ")[0]}` : ""}`} subtitle={`Así va el ${settings?.name ?? "comedor"} hoy`} />

      {!hidden && doneCount < steps.length && (
        <Card className="mb-4 border-accent/40">
          <CardBody>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">Primeros pasos</h2>
              <span className="text-sm text-muted">
                {doneCount} de {steps.length} listos
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-chip-bg overflow-hidden mb-3" aria-hidden="true">
              <div className="h-full bg-accent rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="space-y-1">
              {steps
                .filter((s) => !s.done)
                .map((s) => (
                  <li key={s.key}>
                    <Link to={s.to} className={cn("flex items-center gap-3 rounded-md px-2 py-2 hover:bg-chip-bg", s.key === nextStep?.key && "bg-accent/10 ring-1 ring-accent/40")}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium">{s.title}</span>
                        <span className="block text-xs text-muted">{s.hint}</span>
                      </span>
                      <span className="text-accent text-sm">{s.key === nextStep?.key ? "Empezar →" : "→"}</span>
                    </Link>
                  </li>
                ))}
            </ol>
            <button
              onClick={() => {
                setHidden(true);
                try {
                  localStorage.setItem(hideKey, "1");
                } catch {
                  /* sin almacenamiento */
                }
              }}
              className="mt-2 text-xs text-muted hover:underline"
            >
              Ocultar guía
            </button>
          </CardBody>
        </Card>
      )}

      {sinMenu.length > 0 && (
        <Link to="/pos/menu-dia" className="mb-3 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span>
            {sinMenu.length === 1 ? "1 día" : `${sinMenu.length} días`} de clases sin menú publicado: las familias no pueden reservar
          </span>
          <span className="font-semibold">Publicar →</span>
        </Link>
      )}
      {bajos > 0 && (
        <Link to="/pos/comensales" className="mb-4 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span>
            {bajos === 1 ? "1 comensal" : `${bajos} comensales`} con saldo menor a {formatMoney(minimo)}
          </span>
          <span className="font-semibold">Ver →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Menús entregados" value={menuHoy ? `${menusHoy.length} / ${menuHoy.raciones}` : String(menusHoy.length)} sub={menuHoy ? menuHoy.fondo : "sin menú hoy"} to="/pos/despacho" />
        <Kpi label="Reservas por recoger" value={String(reservas.filter((r) => !served.has(r.comensalId)).length)} sub={`${reservas.length} reservas hoy`} to="/pos/menu-dia" />
        <Kpi
          label="Kiosko hoy"
          value={formatMoney(round2(hoy.filter((k) => k.kind === "kiosko").reduce((s, k) => s + k.total, 0)))}
          sub={`${hoy.filter((k) => k.kind === "kiosko").length} ventas`}
          to="/pos/comedor-reportes"
        />
        <Kpi
          label="Caja"
          value={openCash ? "Abierta" : "Cerrada"}
          sub={openCash ? "recibe recargas en efectivo" : "ábrela para recibir efectivo"}
          to="/pos/caja"
          warn={!openCash}
        />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, to, warn }: { label: string; value: string; sub?: string; to: string; warn?: boolean }) {
  return (
    <Link to={to}>
      <Card className="h-full hover:border-accent/50 transition-colors">
        <CardBody>
          <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
          <p className={cn("text-2xl font-bold font-mono mt-1", warn && "text-warning")}>{value}</p>
          {sub && <p className="text-xs text-muted mt-0.5 truncate">{sub}</p>}
        </CardBody>
      </Card>
    </Link>
  );
}
