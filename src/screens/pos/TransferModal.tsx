import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTables, useOpenOrders, useFloorActions } from "@/data/hooks";
import { cn } from "@/lib/cn";

/** Move an order to a free table, or merge it into another open table. */
export function TransferModal({
  open,
  onClose,
  orderId,
  currentTableId,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  currentTableId: string;
}) {
  const { data: tables = [] } = useTables();
  const { data: openOrders = [] } = useOpenOrders();
  const { transfer, merge } = useFloorActions();

  const freeTables = tables.filter((t) => t.status === "libre");
  const otherOpen = openOrders.filter((o) => o.tableId && o.tableId !== currentTableId);

  return (
    <Modal open={open} onClose={onClose} labelledBy="transfer-title" className="max-w-md">
      <div className="p-5">
        <h2 id="transfer-title" className="text-xl font-bold mb-4">
          Transferir / unir mesa
        </h2>

        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wide text-muted mb-2">Transferir a mesa libre</h3>
          <div className="grid grid-cols-4 gap-2">
            {freeTables.map((t) => (
              <button
                key={t.id}
                onClick={async () => {
                  await transfer.mutateAsync({ orderId, toTableId: t.id });
                  onClose();
                }}
                className={cn(
                  "rounded-md border border-success/40 bg-success/10 text-success py-2 text-sm font-semibold hover:bg-success/20",
                )}
              >
                {t.number}
              </button>
            ))}
            {freeTables.length === 0 && <p className="text-muted text-sm col-span-4">Sin mesas libres.</p>}
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted mb-2">Unir con otra cuenta</h3>
          <div className="space-y-2">
            {otherOpen.map((o) => (
              <button
                key={o.id}
                onClick={async () => {
                  await merge.mutateAsync({ orderId, intoTableId: o.tableId! });
                  onClose();
                }}
                className="w-full flex items-center justify-between rounded-md border border-border bg-surface-alt px-3 py-2 text-sm hover:border-accent/50"
              >
                <span>Mesa {o.tableLabel}</span>
                <span className="text-muted">{o.lines.length} ítems</span>
              </button>
            ))}
            {otherOpen.length === 0 && <p className="text-muted text-sm">Sin otras cuentas abiertas.</p>}
          </div>
        </section>

        <div className="flex justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
