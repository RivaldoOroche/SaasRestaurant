import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { VOID_REASONS } from "@/data/mock/seed";

export function VoidModal({
  open,
  lineName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  lineName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="void-title" className="max-w-sm">
      <div className="p-5">
        <h2 id="void-title" className="text-lg font-bold mb-1">
          Anular ítem
        </h2>
        <p className="text-muted text-sm mb-4">{lineName} · elige un motivo (queda en la bitácora)</p>
        <div className="space-y-2">
          {VOID_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                onConfirm(r);
                onClose();
              }}
              className="w-full text-left rounded-md border border-border bg-surface-alt px-3 py-2 text-sm hover:border-warning/60"
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
