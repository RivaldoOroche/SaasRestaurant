import { useEffect, useMemo, useState } from "react";
import { useDeliveryOrders, useDeliveryActions } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n";
import {
  changeDue,
  isAggregator,
  isFinal,
  isLate,
  minutesSince,
  nextStatus,
  trackingUrl,
  whatsappLink,
} from "@/lib/delivery";
import type { DeliveryOrder, DeliveryStatus } from "@/data/model";
import { ChannelPill, PAY_LABEL } from "./delivery/labels";
import { NuevoDeliveryModal } from "./delivery/NuevoDeliveryModal";
import { DispatchModal, CancelDeliveryModal } from "./delivery/DeliveryActionModals";
import { DeliveryConfigModal } from "./delivery/DeliveryConfigModal";

const COLUMNS: DeliveryStatus[] = ["recibido", "preparando", "listo", "en_camino"];

/** Re-render periódico para que los minutos transcurridos avancen solos. */
function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function Delivery() {
  const t = useT();
  const now = useNow();
  const { session } = useAuth();
  const canManage = session?.role === "dueno" || session?.role === "admin";
  const { data: orders = [], isLoading } = useDeliveryOrders();
  const { setStatus } = useDeliveryActions();

  const [tab, setTab] = useState<"active" | "history">("active");
  const [creating, setCreating] = useState(false);
  const [config, setConfig] = useState(false);
  const [dispatching, setDispatching] = useState<DeliveryOrder | null>(null);
  const [cancelling, setCancelling] = useState<DeliveryOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = orders.filter((o) => !isFinal(o.status));
  const history = orders.filter((o) => isFinal(o.status));
  const delivered = history.filter((o) => o.status === "entregado");
  const kpis = {
    active: active.length,
    late: active.filter((o) => isLate(o, now)).length,
    onRoute: active.filter((o) => o.status === "en_camino").length,
    delivered: delivered.length,
    deliveredAmount: delivered.reduce((s, o) => s + o.total, 0),
  };

  function advance(o: DeliveryOrder) {
    const to = nextStatus(o.status);
    if (!to) return;
    // Despachar un pedido propio requiere elegir repartidor.
    if (to === "en_camino" && !isAggregator(o.channel)) {
      setDispatching(o);
      return;
    }
    run({ id: o.id, to });
  }

  function run(v: { id: string; to: DeliveryStatus; driverId?: string | null; cancelReason?: string }, onDone?: () => void) {
    setError(null);
    setStatus.mutate(v, {
      onSuccess: () => onDone?.(),
      onError: (e) => setError((e as Error).message),
    });
  }

  return (
    <div className="p-6 mob:p-4 max-w-[1400px]">
      <ScreenHeader
        title="Delivery"
        subtitle="Pedidos a domicilio y de apps · del teléfono a la puerta"
        actions={
          <>
            {canManage && (
              <Button variant="secondary" size="sm" onClick={() => setConfig(true)}>
                {t("dl.config")}
              </Button>
            )}
            <Button size="sm" onClick={() => setCreating(true)}>
              {t("dl.new")}
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label={t("dl.kpi.active")} value={String(kpis.active)} />
        <Kpi label={t("dl.kpi.late")} value={String(kpis.late)} tone={kpis.late ? "warning" : undefined} />
        <Kpi label={t("dl.kpi.onRoute")} value={String(kpis.onRoute)} />
        <Kpi label={t("dl.kpi.delivered")} value={`${kpis.delivered} · ${formatMoney(kpis.deliveredAmount)}`} />
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning/10 text-warning text-sm px-3 py-2 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      <div className="flex gap-2 mb-4" role="tablist">
        {(["active", "history"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm border",
              tab === k ? "bg-accent/15 border-accent text-accent" : "bg-chip-bg border-border",
            )}
          >
            {k === "active" ? `${t("dl.tab.active")} (${active.length})` : `${t("dl.tab.history")} (${history.length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted">…</p>
      ) : tab === "active" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((st) => {
            const list = active.filter((o) => o.status === st).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
            return (
              <section key={st} aria-label={t(`dl.st.${st}`)} className="min-w-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="font-semibold text-sm">{t(`dl.st.${st}`)}</h2>
                  <span className="text-xs text-muted">{list.length}</span>
                </div>
                <div className="space-y-3">
                  {list.map((o) => (
                    <DeliveryCard
                      key={o.id}
                      o={o}
                      now={now}
                      busy={setStatus.isPending && setStatus.variables?.id === o.id}
                      onAdvance={() => advance(o)}
                      onCancel={() => setCancelling(o)}
                    />
                  ))}
                  {list.length === 0 && (
                    <p className="text-muted text-xs text-center py-6 border border-dashed border-border rounded-lg">{t("dl.empty")}</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Card className="divide-y divide-border-soft">
          {history.length === 0 && <p className="text-muted text-sm p-4">{t("dl.empty")}</p>}
          {history.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-mono font-bold">{o.code}</span>
              <ChannelPill channel={o.channel} />
              <span className="flex-1 min-w-[10rem] truncate">{o.customerName}</span>
              {o.status === "cancelado" ? (
                <Badge tone="warning" title={o.cancelReason ?? ""}>
                  {t("dl.st.cancelado")} · {o.cancelReason}
                </Badge>
              ) : (
                <Badge tone="success">
                  {t("dl.st.entregado")} · {minutesSince(o.createdAt, new Date(o.deliveredAt ?? o.createdAt).getTime())} {t("dl.min")}
                </Badge>
              )}
              <span className="font-mono">{formatMoney(o.total)}</span>
            </div>
          ))}
        </Card>
      )}

      {creating && <NuevoDeliveryModal onClose={() => setCreating(false)} />}
      {config && <DeliveryConfigModal onClose={() => setConfig(false)} />}
      {dispatching && (
        <DispatchModal
          order={dispatching}
          busy={setStatus.isPending}
          onClose={() => setDispatching(null)}
          onConfirm={(driverId) => run({ id: dispatching.id, to: "en_camino", driverId }, () => setDispatching(null))}
        />
      )}
      {cancelling && (
        <CancelDeliveryModal
          order={cancelling}
          busy={setStatus.isPending}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => run({ id: cancelling.id, to: "cancelado", cancelReason: reason }, () => setCancelling(null))}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-muted text-xs">{label}</p>
      <p className={cn("text-xl font-bold font-mono mt-0.5", tone === "warning" && "text-warning")}>{value}</p>
    </Card>
  );
}

function DeliveryCard({
  o,
  now,
  busy,
  onAdvance,
  onCancel,
}: {
  o: DeliveryOrder;
  now: number;
  busy: boolean;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const agg = isAggregator(o.channel);
  const late = isLate(o, now);
  const mins = minutesSince(o.createdAt, now);
  const vuelto = changeDue(o.total, o.payMethod, o.cashFor);
  const url = trackingUrl(window.location.origin, o.trackingToken);
  const wa = useMemo(
    () =>
      agg
        ? null
        : whatsappLink(
            o.customerPhone,
            `Hola ${o.customerName.split(" ")[0]}, tu pedido ${o.code} está confirmado. Síguelo aquí: ${url}`,
          ),
    [agg, o.customerPhone, o.customerName, o.code, url],
  );

  const actionLabel: Record<string, string> = {
    recibido: t("dl.act.accept"),
    preparando: t("dl.act.ready"),
    listo: agg ? t("dl.act.handRider") : t("dl.act.dispatch"),
    en_camino: t("dl.act.delivered"),
  };

  return (
    <article
      className={cn("rounded-lg border bg-surface p-3 text-sm", late ? "border-warning/60" : "border-border")}
      aria-label={`${o.code} · ${o.customerName}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono font-bold">{o.code}</span>
        <ChannelPill channel={o.channel} />
        <span className={cn("ml-auto text-xs font-mono", late ? "text-warning font-semibold" : "text-muted")}>
          {late && `${t("dl.late")} · `}
          {mins} {t("dl.min")}
        </span>
      </div>
      <p className="font-semibold truncate">{o.customerName}</p>
      <p className="text-muted text-xs truncate">
        {agg ? t("dl.appRider") : `${o.zoneName} · ${o.address}${o.reference ? ` (${o.reference})` : ""}`}
      </p>
      <p className="text-xs mt-1.5 line-clamp-2">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
      {o.notes && <p className="text-xs text-muted mt-1 italic">“{o.notes}”</p>}

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted">
          {PAY_LABEL[o.payMethod]}
          {vuelto > 0 && ` · ${t("dl.change")} ${formatMoney(vuelto)}`}
        </span>
        <span className="font-mono font-semibold">{formatMoney(o.total)}</span>
      </div>
      {o.driverName && (
        <p className="text-xs mt-1">
          🛵 {t("dl.driver")}: <b>{o.driverName}</b>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        <Button size="sm" className="flex-1" disabled={busy} onClick={onAdvance}>
          {busy ? "…" : actionLabel[o.status]}
        </Button>
        <Button size="sm" variant="danger" onClick={onCancel} aria-label={`${t("dl.act.cancel")} ${o.code}`}>
          ✕
        </Button>
      </div>
      {!agg && (
        <div className="flex gap-3 mt-2 text-xs">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="text-success underline">
              WhatsApp
            </a>
          )}
          {o.customerPhone && (
            <a href={`tel:+51${o.customerPhone}`} className="text-accent underline">
              {o.customerPhone}
            </a>
          )}
          <button
            className="text-muted underline ml-auto"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t("dl.act.copied") : t("dl.act.copy")}
          </button>
        </div>
      )}
    </article>
  );
}
