import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTables } from "@/data/hooks";
import { usePos } from "@/store/pos";
import { ScreenHeader } from "@/components/ScreenHeader";
import { cn } from "@/lib/cn";
import type { RestaurantTable, TableStatus } from "@/data/model";

const STATUS_LABEL: Record<TableStatus, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  cuenta: "Pidió cuenta",
  reservada: "Reservada",
};

const STATUS_CLASS: Record<TableStatus, string> = {
  libre: "border-success/50 bg-success/10 text-success",
  ocupada: "border-accent/50 bg-accent/10 text-accent",
  cuenta: "border-warning/50 bg-warning/10 text-warning",
  reservada: "border-neutral/50 bg-neutral/10 text-neutral",
};

export function Mesas() {
  const { data: tables = [] } = useTables();
  const navigate = useNavigate();
  const setActiveTable = usePos((s) => s.setActiveTable);

  const zones = useMemo(() => {
    const map = new Map<string, RestaurantTable[]>();
    for (const t of tables) {
      if (!map.has(t.zone)) map.set(t.zone, []);
      map.get(t.zone)!.push(t);
    }
    return [...map.entries()];
  }, [tables]);

  function openTable(t: RestaurantTable) {
    if (t.status === "reservada") return;
    setActiveTable(t.id);
    navigate("/pos/pedido");
  }

  return (
    <div className="p-6 max-w-6xl">
      <ScreenHeader
        title="Mesas"
        subtitle="Plano por zonas · toca una mesa libre u ocupada para abrir su pedido"
        actions={<Legend />}
      />

      <div className="space-y-6">
        {zones.map(([zone, zoneTables]) => (
          <section key={zone}>
            <h2 className="text-sm font-semibold text-muted mb-2">{zone}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {zoneTables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTable(t)}
                  disabled={t.status === "reservada"}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:cursor-not-allowed",
                    STATUS_CLASS[t.status],
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-ink">{t.number}</span>
                    <span className="text-xs">{t.seats}p</span>
                  </div>
                  <p className="text-xs mt-1">{STATUS_LABEL[t.status]}</p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(Object.keys(STATUS_LABEL) as TableStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full border", STATUS_CLASS[s])} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
