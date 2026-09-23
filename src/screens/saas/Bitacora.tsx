import { useMemo, useState } from "react";
import { useActivity, useTenants } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { ActivityCategory, ActivityLevel, PlatformActivity } from "@/data/platform/model";

const CATS: ActivityCategory[] = [
  "venta", "pago", "sunat", "inventario", "caja", "acceso", "carta", "plan", "soporte", "sistema",
];
const CAT_LABEL: Record<ActivityCategory, string> = {
  venta: "Venta", pago: "Pago", sunat: "SUNAT", inventario: "Inventario", caja: "Caja",
  acceso: "Acceso", carta: "Carta", plan: "Plan", soporte: "Soporte", sistema: "Sistema",
};
const LEVEL_DOT: Record<ActivityLevel, string> = {
  info: "bg-success", warning: "bg-warning", error: "bg-neutral",
};

function fmt(at: string): string {
  const d = new Date(at);
  return d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function Bitacora() {
  const { data: activity = [] } = useActivity();
  const { data: tenants = [] } = useTenants();
  const [tenant, setTenant] = useState("Todos");
  const [cat, setCat] = useState<"Todas" | ActivityCategory>("Todas");
  const [level, setLevel] = useState<"Todos" | ActivityLevel>("Todos");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activity.filter(
      (a) =>
        (tenant === "Todos" || a.tenant === tenant) &&
        (cat === "Todas" || a.category === cat) &&
        (level === "Todos" || a.level === level) &&
        (!needle || a.message.toLowerCase().includes(needle) || a.actor.toLowerCase().includes(needle)),
    );
  }, [activity, tenant, cat, level, q]);

  const warnings = activity.filter((a) => a.level === "warning").length;
  const errors = activity.filter((a) => a.level === "error").length;

  return (
    <div className="p-6 max-w-6xl">
      <ScreenHeader
        title="Bitácora"
        subtitle="Todo lo que hacen los tenants · monitoreo y detección de fallos"
        actions={
          <div className="flex gap-2 text-xs">
            <Pill className="bg-chip-bg">{activity.length} eventos</Pill>
            <Pill className="bg-warning/15 text-warning">{warnings} alertas</Pill>
            <Pill className="bg-neutral/15 text-neutral">{errors} errores</Pill>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select value={tenant} onChange={(e) => setTenant(e.target.value)}
          className="rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm">
          <option>Todos</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
          <option value="Plataforma">Plataforma</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value as ActivityCategory | "Todas")}
          className="rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm">
          <option value="Todas">Todas las categorías</option>
          {CATS.map((c) => (
            <option key={c} value={c}>{CAT_LABEL[c]}</option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as ActivityLevel | "Todos")}
          className="rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm">
          <option value="Todos">Todos los niveles</option>
          <option value="info">Info</option>
          <option value="warning">Alertas</option>
          <option value="error">Errores</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
          className="flex-1 min-w-[10rem] rounded-md bg-chip-bg border border-border px-3 py-1.5 text-sm" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-muted">Sin eventos que coincidan con el filtro.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {rows.map((a) => (
              <Row key={a.id} a={a} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ a }: { a: PlatformActivity }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm",
        a.level === "error" && "bg-neutral/5",
        a.level === "warning" && "bg-warning/5",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", LEVEL_DOT[a.level])} title={a.level} />
      <span className="w-24 shrink-0 font-mono text-xs text-muted">{fmt(a.at)}</span>
      <span className="w-40 shrink-0 truncate font-medium">{a.tenant}</span>
      <span className="w-24 shrink-0 truncate text-muted text-xs">{a.actor}</span>
      <span className="w-24 shrink-0">
        <span className="rounded px-1.5 py-0.5 text-[11px] bg-chip-bg border border-border">{CAT_LABEL[a.category]}</span>
      </span>
      <span className={cn("flex-1 min-w-0 truncate", a.level === "error" && "text-warning font-medium")}>
        {a.message}
      </span>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full px-2 py-0.5", className)}>{children}</span>;
}
