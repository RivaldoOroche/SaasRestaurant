// Inicio del dueño y del gerente: cómo va el día y, si el restaurante es
// nuevo, una guía de primeros pasos que se marca sola a medida que avanza.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCashSessions,
  useInventory,
  useKitchenTickets,
  useMenuChanges,
  useMenuItems,
  useOpenOrders,
  usePaidOrders,
  useSettings,
  useStaff,
  useTables,
} from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney, round2 } from "@/lib/money";
import { inventoryStatus, fmtQty } from "@/lib/inventory";
import { cn } from "@/lib/cn";
import type { Order } from "@/data/model";

/** Total cobrado (los precios ya incluyen IGV). */
const collected = (o: Order) =>
  o.paidTotal ??
  round2(o.lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0));

interface Step {
  key: string;
  title: string;
  hint: string;
  to: string;
  done: boolean;
}

export function Panel() {
  const { session } = useAuth();
  const owner = session?.role === "dueno";
  const { data: paid = [] } = usePaidOrders();
  const { data: open = [] } = useOpenOrders();
  const { data: tickets = [] } = useKitchenTickets();
  const { data: inventory = [] } = useInventory();
  const { data: changes = [] } = useMenuChanges();
  const { data: settings } = useSettings();
  const { data: items = [] } = useMenuItems();
  const { data: tables = [] } = useTables();
  const { data: staff = [] } = useStaff();
  const { data: cash = [] } = useCashSessions();

  const today = useMemo(() => {
    const t0 = new Date().setHours(0, 0, 0, 0);
    const list = paid.filter((o) => Date.parse(o.closedAt ?? o.openedAt) >= t0);
    const sales = round2(list.reduce((s, o) => s + collected(o), 0));
    return {
      sales,
      count: list.length,
      avg: list.length ? round2(sales / list.length) : 0,
    };
  }, [paid]);
  const now = Date.now();
  const delayed = tickets.filter(
    (t) => !t.done && (now - t.enteredAt) / 1000 >= 480,
  ).length;
  const low = inventory.filter((i) => inventoryStatus(i) !== "ok");
  const pendingChanges = changes.filter((c) => c.status === "pendiente").length;
  const openCash = cash.find((c) => c.status === "abierta");

  const steps: Step[] = [
    {
      key: "datos",
      title: "Completa los datos de tu negocio",
      hint: "RUC y razón social: salen en tus boletas y facturas.",
      to: "/pos/ajustes",
      done: !!settings?.ruc && !!settings?.razonSocial,
    },
    {
      key: "carta",
      title: "Arma tu carta",
      hint: "Categorías, platos y precios (con IGV incluido).",
      to: "/pos/editor",
      done: items.length > 0,
    },
    {
      key: "mesas",
      title: "Crea tus mesas",
      hint: "Por zonas: salón, terraza, barra…",
      to: "/pos/mesas",
      done: tables.length > 0,
    },
    ...(owner
      ? [
          {
            key: "personal",
            title: "Agrega a tu personal",
            hint: "Cada mesero con su PIN, para que sus ventas queden a su nombre.",
            to: "/pos/personal",
            done: staff.some((s) => s.active && s.role !== "dueno"),
          },
        ]
      : []),
    {
      key: "sunat",
      title: "Conecta la facturación electrónica",
      hint: "SUNAT directo, sin costo por comprobante. Puedes vender antes y emitir luego.",
      to: "/pos/ajustes",
      done: !!settings?.billingProvider && settings.billingProvider !== "ninguno",
    },
    {
      key: "caja",
      title: "Abre la caja del día",
      hint: "Con el sencillo inicial; al cierre el sistema cuadra solo.",
      to: "/pos/caja",
      done: cash.length > 0,
    },
    {
      key: "venta",
      title: "Haz tu primera venta",
      hint: "Mesas → toca una mesa libre → agrega platos → Cobrar.",
      to: "/pos/mesas",
      done: paid.length > 0,
    },
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
  const showGuide = !hidden && doneCount < steps.length;
  const [showDone, setShowDone] = useState(false);
  const next = steps.find((s) => !s.done);

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader
        title={`Hola${session?.staff?.name ? `, ${session.staff.name.split(" ")[0]}` : ""}`}
        subtitle="Así va tu día"
      />

      {showGuide && (
        <Card className="mb-4 border-accent/40">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-semibold">Primeros pasos</h2>
              <span className="text-sm text-muted">
                {doneCount} de {steps.length} listos
              </span>
            </div>
            <div
              className="h-1.5 rounded-full bg-chip-bg overflow-hidden mb-3"
              aria-hidden="true"
            >
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            {doneCount > 0 && (
              <button
                onClick={() => setShowDone(!showDone)}
                className="mb-1 text-sm text-success hover:underline"
                aria-expanded={showDone}
              >
                ✓{" "}
                {doneCount === 1 ? "1 paso listo" : `${doneCount} pasos listos`}{" "}
                {showDone ? "▴" : "▾"}
              </button>
            )}
            <ol className="space-y-1">
              {steps.map((s, i) =>
                s.done && !showDone ? null : (
                  <li key={s.key}>
                    <Link
                      to={s.to}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 hover:bg-chip-bg",
                        s.key === next?.key &&
                          "bg-accent/10 ring-1 ring-accent/40",
                      )}
                    >
                      <span
                        className={cn(
                          "h-7 w-7 shrink-0 grid place-items-center rounded-full text-sm font-bold",
                          s.done
                            ? "bg-success/20 text-success"
                            : "bg-chip-bg text-muted border border-border",
                        )}
                        aria-hidden="true"
                      >
                        {s.done ? "✓" : i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "block text-sm font-medium",
                            s.done && "line-through text-muted",
                          )}
                        >
                          {s.title}
                        </span>
                        {!s.done && (
                          <span className="block text-xs text-muted">
                            {s.hint}
                          </span>
                        )}
                      </span>
                      {!s.done && (
                        <span className="text-accent text-sm shrink-0">
                          {s.key === next?.key ? "Empezar →" : "→"}
                        </span>
                      )}
                      <span className="sr-only">
                        {s.done ? "(listo)" : "(pendiente)"}
                      </span>
                    </Link>
                  </li>
                ),
              )}
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

      {pendingChanges > 0 && (
        <Link
          to="/pos/carta"
          className="mb-4 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          <span>
            {pendingChanges === 1
              ? "1 cambio de carta propuesto"
              : `${pendingChanges} cambios de carta propuestos`}{" "}
            por tu equipo
          </span>
          <span className="font-semibold">Revisar →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="Ventas de hoy"
          value={formatMoney(today.sales)}
          sub={`${today.count} cobros · ticket ${formatMoney(today.avg)}`}
          to="/pos/reportes"
        />
        <Kpi
          label="Mesas atendiéndose"
          value={String(open.length)}
          to="/pos/cuentas"
        />
        <Kpi
          label="Comandas con retraso"
          value={String(delayed)}
          sub="más de 8 min"
          to="/pos/cocina"
          tone={delayed ? "warn" : undefined}
        />
        <Kpi
          label="Caja"
          value={openCash ? "Abierta" : "Cerrada"}
          sub={
            openCash
              ? `desde ${new Date(openCash.openedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
              : "ábrela para cobrar en efectivo"
          }
          to="/pos/caja"
          tone={openCash ? undefined : "warn"}
        />
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Insumos por reponer</h3>
            <Link to="/pos/inventario" className="text-accent text-sm">
              Ir a Inventario →
            </Link>
          </div>
          {low.length === 0 ? (
            <p className="text-muted text-sm">
              Todo el inventario está en nivel.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {low.slice(0, 8).map((i) => (
                <li key={i.id} className="flex justify-between text-sm">
                  <span>{i.name}</span>
                  <span className="font-mono text-warning">
                    {fmtQty(i.stock)} / {fmtQty(i.par)} {i.unit}
                  </span>
                </li>
              ))}
              {low.length > 8 && (
                <li className="text-xs text-muted">y {low.length - 8} más…</li>
              )}
            </ul>
          )}
        </CardBody>
      </Card>
      {!showGuide && doneCount < steps.length && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-3"
          onClick={() => {
            setHidden(false);
            try {
              localStorage.removeItem(hideKey);
            } catch {
              /* sin almacenamiento */
            }
          }}
        >
          Ver guía de primeros pasos
        </Button>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  to,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  to: string;
  tone?: "warn";
}) {
  return (
    <Link to={to}>
      <Card className="h-full hover:border-accent/50 transition-colors">
        <CardBody>
          <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
          <p
            className={cn(
              "text-2xl font-bold font-mono mt-1",
              tone === "warn" && "text-warning",
            )}
          >
            {value}
          </p>
          {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        </CardBody>
      </Card>
    </Link>
  );
}
