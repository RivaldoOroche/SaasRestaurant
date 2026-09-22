import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTables, useTableActions } from "@/data/hooks";
import { usePos } from "@/store/pos";
import { useBranchStore } from "@/store/branch";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
  const role = useAuth().session?.role;
  const canManage = role === "dueno" || role === "admin";
  const [config, setConfig] = useState(false);

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
        actions={
          <div className="flex items-center gap-3">
            <Legend />
            {canManage && (
              <Button size="sm" variant="secondary" onClick={() => setConfig(true)}>
                ⚙ Configurar mesas
              </Button>
            )}
          </div>
        }
      />

      {tables.length === 0 ? (
        <Card className="p-10 text-center text-muted">
          Esta sucursal aún no tiene mesas.
          {canManage ? (
            <div className="mt-3">
              <Button size="sm" onClick={() => setConfig(true)}>
                Configurar mesas
              </Button>
            </div>
          ) : (
            " Pide a un administrador que las configure."
          )}
        </Card>
      ) : (
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
      )}

      {config && <TableConfigModal tables={tables} onClose={() => setConfig(false)} />}
    </div>
  );
}

function TableConfigModal({ tables, onClose }: { tables: RestaurantTable[]; onClose: () => void }) {
  const { addTable, updateTable, removeTable } = useTableActions();
  const branchId = useBranchStore((s) => s.branchId);
  const [zone, setZone] = useState("");
  const [seats, setSeats] = useState(4);
  const [count, setCount] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  const zonesExistentes = [...new Set(tables.map((t) => t.zone))];
  const nextNumber = (tables.reduce((m, t) => Math.max(m, t.number), 0) || 0) + 1;

  function agregar() {
    setErr(null);
    const z = zone.trim() || zonesExistentes[0] || "Salón";
    addTable.mutate({ zone: z, number: nextNumber, seats, branchId, count });
    setZone(z);
  }

  return (
    <Modal open onClose={onClose} labelledBy="cfg-title" className="max-w-lg">
      <div className="p-5">
        <h2 id="cfg-title" className="text-lg font-bold mb-1">Configurar mesas</h2>
        <p className="text-muted text-sm mb-4">Mesas de la sucursal activa. Solo puedes eliminar mesas libres.</p>

        {/* Agregar */}
        <div className="rounded-lg bg-surface-alt border border-border-soft p-3 mb-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-2">
            Agregar mesas {count > 1 ? `(Nº ${nextNumber}–${nextNumber + count - 1})` : `(Nº ${nextNumber})`}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[10rem]">
              <label className="text-xs text-muted">Zona (elige o escribe una nueva)</label>
              <input
                list="zonas"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Ej. Terraza, Jardín, VIP…"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
              />
              <datalist id="zonas">
                {zonesExistentes.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </div>
            <div className="w-20">
              <label className="text-xs text-muted">Sillas</label>
              <input
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="w-20">
              <label className="text-xs text-muted">Cantidad</label>
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </div>
            <Button size="sm" onClick={agregar} disabled={addTable.isPending}>
              Agregar
            </Button>
          </div>
        </div>

        {err && <p className="text-warning text-xs mb-2">{err}</p>}

        {/* Lista editable */}
        <div className="max-h-80 overflow-y-auto divide-y divide-border-soft">
          {tables.length === 0 && <p className="text-muted text-sm py-4 text-center">Aún no hay mesas.</p>}
          {tables.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2">
              <span className="w-10 font-mono font-bold">{t.number}</span>
              <input
                defaultValue={t.zone}
                onBlur={(e) => e.target.value !== t.zone && updateTable.mutate({ id: t.id, patch: { zone: e.target.value } })}
                className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1 text-sm"
              />
              <input
                type="number"
                min={1}
                defaultValue={t.seats}
                onBlur={(e) => Number(e.target.value) !== t.seats && updateTable.mutate({ id: t.id, patch: { seats: Math.max(1, Number(e.target.value) || 1) } })}
                className="w-16 rounded-md bg-chip-bg border border-border px-2 py-1 text-sm font-mono"
              />
              <span className={cn("text-xs px-2 py-0.5 rounded", STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</span>
              <button
                onClick={() => {
                  setErr(null);
                  removeTable.mutate(t.id, { onError: (e) => setErr((e as Error).message) });
                }}
                disabled={t.status !== "libre"}
                className="text-warning text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={t.status !== "libre" ? "Solo se pueden eliminar mesas libres" : "Eliminar"}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    </Modal>
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
