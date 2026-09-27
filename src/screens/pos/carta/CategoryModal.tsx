import { useState } from "react";
import { useMenuActions } from "@/data/hooks";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Category } from "@/data/model";

const ICONS = ["🥑", "🐟", "🍲", "🥩", "🍗", "🍝", "🥗", "🍕", "🍣", "🌮", "🍮", "🍰", "🍹", "🍺", "☕", "🥤", "🍽️", "⭐"];
const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";

export function CategoryModal({
  category,
  itemCount,
  onClose,
}: {
  category: Category | null;
  itemCount: number;
  onClose: (result?: "saved" | "deleted") => void;
}) {
  const { saveCategory, removeCategory } = useMenuActions();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "🍽️");
  const [subtitle, setSubtitle] = useState(category?.subtitle ?? "");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    try {
      await saveCategory.mutateAsync({ id: category?.id, name, icon, subtitle });
      onClose("saved");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={() => onClose()} labelledBy="cat-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="cat-title" className="text-lg font-bold">
          {category ? "Editar categoría" : "Nueva categoría"}
        </h2>
        <label className="block">
          <span className="text-xs text-muted">Nombre</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ceviches" className={field} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Frase corta (opcional, se ve en la carta digital)</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ej. Frescos del día" className={field} />
        </label>
        <fieldset>
          <legend className="text-xs text-muted mb-1">Ícono</legend>
          <div className="flex flex-wrap gap-1">
            {ICONS.map((i) => (
              <button
                type="button"
                key={i}
                onClick={() => setIcon(i)}
                aria-pressed={icon === i}
                className={cn("h-9 w-9 rounded-md text-lg", icon === i ? "bg-accent/25 ring-1 ring-accent" : "bg-chip-bg")}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          {category ? (
            <Button
              type="button"
              variant="danger"
              disabled={itemCount > 0}
              title={itemCount > 0 ? "Mueve o archiva sus platos primero" : undefined}
              onClick={() =>
                removeCategory.mutate(category.id, {
                  onSuccess: () => onClose("deleted"),
                  onError: (e) => setErr((e as Error).message),
                })
              }
            >
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onClose()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || saveCategory.isPending}>
              {category ? "Guardar" : "Crear categoría"}
            </Button>
          </div>
        </div>
        {category && itemCount > 0 && <p className="text-xs text-muted">Para eliminarla, primero mueve o archiva sus {itemCount} platos.</p>}
      </form>
    </Modal>
  );
}
