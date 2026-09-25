import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useDeliveryActions, useDeliveryZones, useMenuItems } from "@/data/hooks";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import {
  changeDue,
  deliveryTotals,
  isAggregator,
  trackingUrl,
  validateNewDelivery,
  whatsappLink,
} from "@/lib/delivery";
import type { DeliveryChannel, DeliveryItem, DeliveryOrder, DeliveryPay, NewDeliveryInput } from "@/data/model";
import { CHANNEL_LABEL, PAY_LABEL } from "./labels";

const CHANNELS: DeliveryChannel[] = ["telefono", "whatsapp", "web", "rappi", "pedidosya"];
const OWN_PAYS: DeliveryPay[] = ["efectivo", "yape", "plin", "tarjeta"];

export function NuevoDeliveryModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { data: zones = [] } = useDeliveryZones();
  const { data: menu = [] } = useMenuItems();
  const { create } = useDeliveryActions();

  const [channel, setChannel] = useState<DeliveryChannel>("telefono");
  const [customerName, setName] = useState("");
  const [customerPhone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [payMethod, setPay] = useState<DeliveryPay>("efectivo");
  const [cashFor, setCashFor] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DeliveryOrder | null>(null);

  const agg = isAggregator(channel);
  const activeZones = zones.filter((z) => z.active);
  const zone = agg ? undefined : zones.find((z) => z.id === zoneId);
  const totals = deliveryTotals(items, zone?.fee ?? 0);
  const cash = cashFor.trim() === "" ? null : Number(cashFor);
  const vuelto = changeDue(totals.total, payMethod, cash);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((m) => m.available && (!q || m.name.toLowerCase().includes(q))).slice(0, q ? 12 : 8);
  }, [menu, search]);

  function pickChannel(c: DeliveryChannel) {
    setChannel(c);
    setPay(isAggregator(c) ? "pagado_app" : "efectivo");
  }

  function addItem(name: string, price: number) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.name === name && x.price === price);
      if (i >= 0) return prev.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
      return [...prev, { name, price, qty: 1 }];
    });
  }
  function setQty(idx: number, qty: number) {
    setItems((prev) => (qty <= 0 ? prev.filter((_, j) => j !== idx) : prev.map((x, j) => (j === idx ? { ...x, qty } : x))));
  }

  function submit() {
    const input: NewDeliveryInput = {
      channel,
      customerName,
      customerPhone: agg ? "" : customerPhone,
      address: agg ? "" : address,
      reference: agg ? "" : reference,
      zoneId: agg ? null : zoneId,
      items,
      payMethod,
      cashFor: payMethod === "efectivo" ? cash : null,
      notes,
    };
    // Misma validación que el repo, antes de enviar, para dar el error al instante.
    const err = validateNewDelivery(input, zones);
    if (err) return setError(err);
    setError(null);
    create.mutate(input, {
      onSuccess: (o) => setCreated(o),
      onError: (e) => setError((e as Error).message),
    });
  }

  // Paso 2: confirmación con enlace de seguimiento.
  if (created) {
    const url = trackingUrl(window.location.origin, created.trackingToken);
    const wa = whatsappLink(
      created.customerPhone,
      `Hola ${created.customerName.split(" ")[0]}, recibimos tu pedido ${created.code} por ${formatMoney(created.total)}. Síguelo aquí: ${url}`,
    );
    return (
      <Modal open onClose={onClose} labelledBy="dl-created" className="max-w-md">
        <div className="p-6 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">✅</div>
          <h2 id="dl-created" className="text-xl font-bold">
            {t("dl.created")} {created.code}
          </h2>
          <p className="text-muted text-sm mt-1">
            {created.customerName} · {formatMoney(created.total)}
          </p>
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="mt-4 w-full rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono" aria-label="Enlace de seguimiento" />
          <div className="flex flex-col gap-2 mt-4">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button className="w-full">{t("dl.sendTracking")}</Button>
              </a>
            )}
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(url)}>
              {t("dl.act.copy")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t("cobro.done")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} labelledBy="dl-new" className="max-w-2xl">
      <div className="p-5 space-y-4">
        <h2 id="dl-new" className="text-lg font-bold">
          Nuevo pedido de delivery
        </h2>

        <Group label="Canal">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <Chip key={c} on={channel === c} onClick={() => pickChannel(c)}>
                {CHANNEL_LABEL[c]}
              </Chip>
            ))}
          </div>
        </Group>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={agg ? "Cliente / N.º de pedido de la app" : "Nombre del cliente"}>
            <input value={customerName} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="off" />
          </Field>
          {!agg && (
            <Field label="Celular">
              <input value={customerPhone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="987 654 321" className={inputCls} />
            </Field>
          )}
        </div>

        {!agg && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Dirección">
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} autoComplete="off" />
              </Field>
              <Field label="Referencia (opcional)">
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Group label="Zona de reparto">
              {activeZones.length === 0 ? (
                <p className="text-sm text-muted">No hay zonas activas. Pide a gerencia que las configure.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeZones.map((z) => (
                    <Chip key={z.id} on={zoneId === z.id} onClick={() => setZoneId(z.id)}>
                      {z.name} · {formatMoney(z.fee)} · {z.etaMin} min
                    </Chip>
                  ))}
                </div>
              )}
            </Group>
          </>
        )}

        <Group label="Productos">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pedido.search")}
            aria-label="Buscar productos"
            className={cn(inputCls, "mb-2")}
          />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addItem(m.name, m.price)}
                className="rounded-md border border-border bg-chip-bg px-2 py-1 text-xs hover:border-accent/60"
              >
                {m.emoji} {m.name} · {formatMoney(m.price)}
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <ul className="divide-y divide-border-soft rounded-md border border-border">
              {items.map((i, idx) => (
                <li key={`${i.name}-${idx}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{i.name}</span>
                  <button type="button" className={stepCls} onClick={() => setQty(idx, i.qty - 1)} aria-label={`Quitar uno de ${i.name}`}>
                    −
                  </button>
                  <span className="w-6 text-center font-mono">{i.qty}</span>
                  <button type="button" className={stepCls} onClick={() => setQty(idx, i.qty + 1)} aria-label={`Agregar uno de ${i.name}`}>
                    +
                  </button>
                  <span className="w-20 text-right font-mono">{formatMoney(i.price * i.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </Group>

        <Group label="Pago">
          {agg ? (
            <p className="text-sm">{PAY_LABEL.pagado_app}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {OWN_PAYS.map((p) => (
                <Chip key={p} on={payMethod === p} onClick={() => setPay(p)}>
                  {PAY_LABEL[p]}
                </Chip>
              ))}
              {payMethod === "efectivo" && (
                <label className="flex items-center gap-2 text-sm ml-1">
                  Paga con
                  <input
                    value={cashFor}
                    onChange={(e) => setCashFor(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="100"
                    className={cn(inputCls, "w-24")}
                  />
                </label>
              )}
            </div>
          )}
        </Group>

        <Field label="Notas para cocina / reparto (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sin cebolla, tocar timbre 2…" className={inputCls} />
        </Field>

        <div className="rounded-lg bg-surface-alt border border-border-soft p-3 text-sm space-y-1">
          <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
          {!agg && <Row label={`Envío${zone ? ` · ${zone.name}` : ""}`} value={formatMoney(totals.fee)} />}
          <Row label="Total" value={formatMoney(totals.total)} bold />
          {vuelto > 0 && <Row label="Vuelto a llevar" value={formatMoney(vuelto)} />}
        </div>

        {error && (
          <p role="alert" className="text-warning text-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "…" : `Crear pedido · ${formatMoney(totals.total)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const inputCls = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";
const stepCls = "h-7 w-7 rounded-md border border-border bg-chip-bg grid place-items-center";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/** Grupo de opciones (chips/botones): fieldset en vez de <label> para no reenviar clics. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</legend>
      {children}
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full px-3 py-1.5 text-sm border", on ? "bg-accent/15 border-accent text-accent" : "bg-chip-bg border-border")}
    >
      {children}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "font-bold pt-1 border-t border-border-soft")}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
