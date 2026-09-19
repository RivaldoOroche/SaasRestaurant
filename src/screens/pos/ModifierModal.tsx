import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { MenuItem, ModifierExtra, ModifierPref, DraftLine } from "@/data/model";

const TERMS = ["Rojo", "Medio", "Tres cuartos", "Bien cocido"];

export function ModifierModal({
  item,
  extras,
  prefs,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  extras: ModifierExtra[];
  prefs: ModifierPref[];
  onClose: () => void;
  onAdd: (line: DraftLine) => void;
}) {
  const [term, setTerm] = useState<string | null>(null);
  const [chosenExtras, setChosenExtras] = useState<Set<string>>(new Set());
  const [chosenPrefs, setChosenPrefs] = useState<Set<string>>(new Set());

  const extraPrice = useMemo(
    () => extras.filter((e) => chosenExtras.has(e.id)).reduce((s, e) => s + e.price, 0),
    [extras, chosenExtras],
  );

  if (!item) return null;

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  }

  function confirm() {
    if (!item) return;
    const parts: string[] = [];
    if (term) parts.push(term);
    parts.push(...extras.filter((e) => chosenExtras.has(e.id)).map((e) => e.name));
    parts.push(...prefs.filter((p) => chosenPrefs.has(p.id)).map((p) => p.name));
    onAdd({
      itemId: item.id,
      name: item.name,
      qty: 1,
      unitPrice: item.price,
      extraPrice,
      modifiers: parts.join(" · "),
    });
    onClose();
  }

  return (
    <Modal open={!!item} onClose={onClose} labelledBy="mod-title">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="mod-title" className="text-xl font-bold">
            {item.emoji} {item.name}
          </h2>
          <span className="font-mono text-accent font-semibold">{formatMoney(item.price)}</span>
        </div>
        <p className="text-muted text-sm mb-4">{item.description}</p>

        {item.meat && (
          <Section title="Término de cocción">
            <div className="flex flex-wrap gap-2">
              {TERMS.map((t) => (
                <Chip key={t} active={term === t} onClick={() => setTerm(term === t ? null : t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        <Section title="Extras">
          <div className="flex flex-wrap gap-2">
            {extras.map((e) => (
              <Chip
                key={e.id}
                active={chosenExtras.has(e.id)}
                onClick={() => toggle(chosenExtras, e.id, setChosenExtras)}
              >
                {e.name} <span className="opacity-70">+{formatMoney(e.price)}</span>
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Preferencias">
          <div className="flex flex-wrap gap-2">
            {prefs.map((p) => (
              <Chip
                key={p.id}
                active={chosenPrefs.has(p.id)}
                onClick={() => toggle(chosenPrefs, p.id, setChosenPrefs)}
              >
                {p.name}
              </Chip>
            ))}
          </div>
        </Section>

        <div className="flex items-center justify-between mt-6">
          <span className="text-muted text-sm">
            Total línea{" "}
            <span className="font-mono text-ink font-semibold">
              {formatMoney(item.price + extraPrice)}
            </span>
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={confirm}>Agregar al ticket</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs uppercase tracking-wide text-muted mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm border transition-colors",
        active
          ? "bg-accent/20 border-accent text-accent"
          : "bg-chip-bg border-border text-ink hover:border-accent/50",
      )}
    >
      {children}
    </button>
  );
}
