import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useDrivers } from "@/data/hooks";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { changeDue } from "@/lib/delivery";
import { formatMoney } from "@/lib/money";
import type { DeliveryOrder } from "@/data/model";
import { VEHICLE_ICON } from "./labels";

/** Elegir repartidor al despachar un pedido propio. */
export function DispatchModal({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: DeliveryOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (driverId: string) => void;
}) {
  const t = useT();
  const { data: drivers = [] } = useDrivers();
  const available = drivers.filter((d) => d.active);
  const [driverId, setDriverId] = useState<string | null>(order.driverId ?? available[0]?.id ?? null);
  const vuelto = changeDue(order.total, order.payMethod, order.cashFor);

  return (
    <Modal open onClose={onClose} labelledBy="dispatch-title" className="max-w-md">
      <div className="p-5">
        <h2 id="dispatch-title" className="text-lg font-bold">
          {t("dl.act.dispatch")} {order.code}
        </h2>
        <p className="text-muted text-sm mb-4">
          {order.zoneName} · {order.address}
        </p>
        {vuelto > 0 && (
          <p className="rounded-md bg-warning/10 text-warning text-sm px-3 py-2 mb-3">
            💵 Llevar vuelto: <b>{formatMoney(vuelto)}</b> (paga con {formatMoney(order.cashFor ?? 0)})
          </p>
        )}
        <fieldset>
          <legend className="text-xs uppercase tracking-wide text-muted mb-2">{t("dl.pickDriver")}</legend>
          {available.length === 0 ? (
            <p className="text-sm text-muted">{t("dl.noDrivers")}</p>
          ) : (
            <div className="space-y-2">
              {available.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer",
                    driverId === d.id ? "border-accent bg-accent/10" : "border-border bg-chip-bg",
                  )}
                >
                  <input
                    type="radio"
                    name="driver"
                    value={d.id}
                    checked={driverId === d.id}
                    onChange={() => setDriverId(d.id)}
                    className="accent-[#9184d9]"
                  />
                  <span aria-hidden="true">{VEHICLE_ICON[d.vehicle]}</span>
                  <span className="flex-1 font-medium">{d.name}</span>
                  <span className="text-muted text-xs font-mono">{d.phone}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose}>
            {t("dl.back")}
          </Button>
          <Button disabled={!driverId || busy} onClick={() => driverId && onConfirm(driverId)}>
            {busy ? "…" : t("dl.act.dispatch")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const REASONS = ["El cliente canceló", "Sin stock de un producto", "Fuera de la zona de reparto", "Pedido duplicado", "No se pudo contactar al cliente"];

/** Cancelar con motivo obligatorio (queda en el historial y la bitácora). */
export function CancelDeliveryModal({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: DeliveryOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} labelledBy="cancel-title" className="max-w-md">
      <div className="p-5">
        <h2 id="cancel-title" className="text-lg font-bold">
          {t("dl.cancelTitle")} {order.code}
        </h2>
        <p className="text-muted text-sm mb-3">{order.customerName}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={cn(
                "rounded-full px-3 py-1 text-xs border",
                reason === r ? "bg-warning/15 border-warning text-warning" : "bg-chip-bg border-border",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{t("dl.cancelReason")}</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          />
        </label>
        {order.status !== "recibido" && (
          <p className="text-xs text-muted mt-2">La comanda se retirará de la pantalla de cocina.</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose}>
            {t("dl.back")}
          </Button>
          <Button variant="danger" disabled={!reason.trim() || busy} onClick={() => onConfirm(reason.trim())}>
            {busy ? "…" : t("dl.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
