import { useState } from "react";
import { useMenuActions, useRecipes } from "@/data/hooks";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { parseQty, UNITS } from "@/lib/inventory";
import type { InventoryItem } from "@/data/model";

const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";

export function InsumoModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { saveInventoryItem, archiveInventoryItem } = useMenuActions();
  const { data: recipes = {} } = useRecipes();
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "kg");
  const [cost, setCost] = useState(item?.cost != null ? String(item.cost) : "");
  const [par, setPar] = useState(item ? String(item.par) : "");
  const [err, setErr] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const usedIn = item ? Object.values(recipes).filter((lines) => lines.some((l) => l.inventoryId === item.id)).length : 0;

  async function save() {
    setErr(null);
    const c = cost.trim() ? parseQty(cost) : 0;
    const p = par.trim() ? parseQty(par) : 0;
    if (!name.trim()) return setErr("Escribe el nombre del insumo.");
    if (Number.isNaN(c) || c < 0) return setErr("El costo debe ser un número (ej. 12.50).");
    if (Number.isNaN(p) || p < 0) return setErr("El stock ideal debe ser un número (ej. 10).");
    try {
      await saveInventoryItem.mutateAsync({ id: item?.id, name, unit: unit.trim() || "und", cost: c, par: p });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="insumo-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="insumo-title" className="text-lg font-bold">
          {item ? "Editar insumo" : "Nuevo insumo"}
        </h2>
        <label className="block">
          <span className="text-xs text-muted">Nombre</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pescado fresco" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted">Unidad de medida</span>
            <input list="insumo-units" value={unit} onChange={(e) => setUnit(e.target.value)} className={field} />
            <datalist id="insumo-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Costo por {unit || "unidad"} (S/)</span>
            <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="0.00" className={`${field} font-mono`} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted">Stock ideal por sucursal ({unit || "unidades"})</span>
          <input value={par} onChange={(e) => setPar(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Ej. 10" className={`${field} font-mono`} />
          <span className="text-xs text-muted">Te avisamos «Stock bajo» cuando quede menos del 40 %.</span>
        </label>
        {!item && <p className="text-xs text-muted">El stock empieza en 0: después registra una compra o un conteo.</p>}
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        {confirmArchive && item ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm space-y-2">
            <p>
              ¿Dejar de usar «{item.name}»?{" "}
              {usedIn > 0 ? `Se quitará de ${usedIn === 1 ? "1 receta" : `${usedIn} recetas`}.` : ""} El historial de movimientos se conserva.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmArchive(false)}>
                No
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => archiveInventoryItem.mutate(item.id, { onSuccess: onClose, onError: (e) => setErr((e as Error).message) })}
              >
                Sí, dejar de usar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2">
            {item ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmArchive(true)}>
                Dejar de usar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveInventoryItem.isPending}>
                {item ? "Guardar" : "Crear insumo"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
