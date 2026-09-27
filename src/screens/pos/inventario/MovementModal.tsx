// Un solo lugar para mover stock: compra (entra), merma (sale), conteo físico
// (corrige al número real) y traslado entre sucursales.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBranches, useInventory, useInventoryActions, useMenuActions, useRepo } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { buildTree, flatten, indentedName } from "@/lib/branchTree";
import { fmtQty, parseQty } from "@/lib/inventory";
import type { InventoryItem } from "@/data/model";

export type MovementKind = "compra" | "merma" | "conteo" | "traslado";
const KINDS: { key: MovementKind; label: string; hint: string }[] = [
  { key: "compra", label: "Compra", hint: "Llegó mercadería: suma al stock." },
  { key: "merma", label: "Merma", hint: "Se venció, se malogró o se desperdició: resta del stock." },
  { key: "conteo", label: "Conteo", hint: "Contaste lo que hay: el sistema corrige la diferencia." },
  { key: "traslado", label: "Traslado", hint: "Envías insumos de una sucursal a otra." },
];
const MERMA_REASONS = ["Vencido", "Se malogró", "Error en preparación", "Cortesía"];
const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";

export function MovementModal({ item, initialKind, onClose }: { item: InventoryItem | null; initialKind: MovementKind; onClose: () => void }) {
  const repo = useRepo();
  const { session } = useAuth();
  const actor = session?.staff?.name ?? "Gerencia";
  const { data: items = [] } = useInventory();
  const { data: branches = [] } = useBranches();
  const { branchId, move, transfer } = useInventoryActions();
  const { saveInventoryItem } = useMenuActions();

  const tree = flatten(buildTree(branches.filter((b) => b.active !== false)));
  const root = tree[0]?.id ?? "";
  const [kind, setKind] = useState<MovementKind>(tree.length > 1 ? initialKind : initialKind === "traslado" ? "compra" : initialKind);
  const [itemId, setItemId] = useState(item?.id ?? items[0]?.id ?? "");
  const [branchSel, setBranch] = useState("");
  const [toSel, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Por defecto: la sucursal en la que estás (o la principal) y la siguiente como destino.
  const branch = branchSel || branchId || root;
  const to = toSel && toSel !== branch ? toSel : tree.find((b) => b.id !== branch)?.id ?? "";
  const it = items.find((i) => i.id === (itemId || items[0]?.id));
  // Stock de la sucursal elegida (mismo caché que la pantalla de inventario).
  const { data: branchStock = [] } = useQuery({
    queryKey: ["inventory", branch || null],
    queryFn: () => repo.getInventory(branch || null),
    enabled: !!branch,
  });
  const here = branchStock.find((i) => i.id === itemId)?.stock ?? 0;
  const n = parseQty(qty);
  const valid = !Number.isNaN(n) && (kind === "conteo" ? n >= 0 : n > 0);
  const diff = kind === "conteo" && valid ? Math.round((n - here) * 1000) / 1000 : 0;
  const busy = move.isPending || transfer.isPending;
  const branchLabel = (id: string) => tree.find((b) => b.id === id)?.name ?? "";

  async function submit() {
    setErr(null);
    if (!it) return setErr("Elige un insumo.");
    if (!valid) return setErr(kind === "conteo" ? "Escribe cuánto hay (puede ser 0)." : "Escribe una cantidad mayor que cero.");
    try {
      if (kind === "traslado") {
        if (!to || to === branch) return setErr("Elige una sucursal de destino distinta al origen.");
        await transfer.mutateAsync({ itemId: it.id, fromBranchId: branch, toBranchId: to, qty: n, note, actor });
      } else if (kind === "conteo") {
        if (diff === 0) return onClose();
        await move.mutateAsync({ itemId: it.id, delta: diff, reason: "ajuste", note: note || "Conteo físico", actor, branchId: branch });
      } else {
        const delta = kind === "compra" ? n : -n;
        await move.mutateAsync({ itemId: it.id, delta, reason: kind, note, actor, branchId: branch });
        const total = parseQty(paid);
        if (kind === "compra" && total > 0) {
          await saveInventoryItem.mutateAsync({ id: it.id, name: it.name, unit: it.unit, par: it.par, cost: Math.round((total / n) * 100) / 100 });
        }
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const unit = it?.unit ?? "";
  return (
    <Modal open onClose={onClose} labelledBy="mov-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="mov-title" className="text-lg font-bold">
          Registrar movimiento
        </h2>
        <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-4 gap-1 rounded-lg bg-chip-bg p-1">
          {KINDS.filter((k) => k.key !== "traslado" || tree.length > 1).map((k) => (
            <button
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              key={k.key}
              onClick={() => (setKind(k.key), setErr(null))}
              className={cn("rounded-md py-1.5 text-sm", kind === k.key ? "bg-surface font-semibold shadow-sm" : "text-muted")}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{KINDS.find((k) => k.key === kind)?.hint}</p>

        <label className="block">
          <span className="text-xs text-muted">Insumo</span>
          <select value={it?.id ?? ""} onChange={(e) => setItemId(e.target.value)} className={field}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
        </label>

        {tree.length > 1 && (
          <div className={cn("grid gap-3", kind === "traslado" && "grid-cols-2")}>
            <label className="block">
              <span className="text-xs text-muted">{kind === "traslado" ? "Desde" : "Sucursal"}</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={field}>
                {tree.map((b) => (
                  <option key={b.id} value={b.id}>
                    {indentedName(b)}
                  </option>
                ))}
              </select>
            </label>
            {kind === "traslado" && (
              <label className="block">
                <span className="text-xs text-muted">Hacia</span>
                <select value={to} onChange={(e) => setTo(e.target.value)} className={field}>
                  {tree
                    .filter((b) => b.id !== branch)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {indentedName(b)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        )}

        <p className="text-sm">
          Hay <span className="font-mono font-semibold">{fmtQty(here)}</span> {unit} en {branchLabel(branch) || "esta sucursal"}.
        </p>

        <label className="block">
          <span className="text-xs text-muted">
            {kind === "conteo" ? `¿Cuánto hay realmente? (${unit})` : kind === "traslado" ? `Cantidad a enviar (${unit})` : `Cantidad (${unit})`}
          </span>
          <input
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className={`${field} font-mono text-lg`}
          />
        </label>

        {kind === "conteo" && valid && (
          <p className={cn("text-sm", diff === 0 ? "text-success" : "text-warning")}>
            {diff === 0 ? "Coincide con el sistema." : `Diferencia: ${diff > 0 ? "+" : ""}${fmtQty(diff)} ${unit}`}
          </p>
        )}
        {kind === "traslado" && valid && n > here && (
          <p className="text-sm text-warning">
            Es más de lo registrado en {branchLabel(branch)}. Se enviará igual; haz un conteo allí si el número no cuadra.
          </p>
        )}
        {kind === "compra" && (
          <label className="block">
            <span className="text-xs text-muted">Total pagado (opcional, actualiza el costo para el food cost)</span>
            <input
              value={paid}
              onChange={(e) => setPaid(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="S/ 0.00"
              className={`${field} font-mono`}
            />
            {valid && parseQty(paid) > 0 && (
              <span className="text-xs text-muted">
                Nuevo costo: {formatMoney(Math.round((parseQty(paid) / n) * 100) / 100)} por {unit}
              </span>
            )}
          </label>
        )}
        {kind === "merma" && (
          <div className="flex flex-wrap gap-1">
            {MERMA_REASONS.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setNote(r)}
                aria-pressed={note === r}
                className={cn("rounded-full border px-3 py-1 text-xs", note === r ? "border-accent bg-accent/20 text-accent" : "border-border bg-chip-bg")}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <label className="block">
          <span className="text-xs text-muted">Nota (opcional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "compra" ? "Ej. Proveedor, N° de factura" : ""} className={field} />
        </label>

        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !it}>
            {kind === "compra" ? "Registrar compra" : kind === "merma" ? "Registrar merma" : kind === "conteo" ? "Guardar conteo" : "Trasladar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
