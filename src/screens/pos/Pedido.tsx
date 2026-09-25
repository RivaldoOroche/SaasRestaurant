import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCategories,
  useMenuItems,
  useExtras,
  usePrefs,
  useTables,
  useOpenOrder,
  useOrderActions,
  useFloorActions,
  useSettings,
} from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { usePos } from "@/store/pos";
import { formatMoney, round2 } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { MenuItem, DraftLine, Order } from "@/data/model";
import { ModifierModal } from "./ModifierModal";
import { CobroModal } from "./CobroModal";
import { TransferModal } from "./TransferModal";
import { VoidModal } from "./VoidModal";
import type { OrderLine } from "@/data/model";

type Filter = "veg" | "spicy" | "gf";

export function Pedido() {
  const navigate = useNavigate();
  const t = useT();
  const activeTableId = usePos((s) => s.activeTableId);
  const { data: tables } = useTables();
  const { data: order } = useOpenOrder(activeTableId);

  const activeTable = tables?.find((t) => t.id === activeTableId) ?? null;

  if (!activeTableId || !activeTable) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">{t("pedido.title")}</h1>
        <p className="text-muted mb-6">{t("pedido.chooseTable")}</p>
        <Button onClick={() => navigate("/pos/mesas")}>{t("pedido.goTables")}</Button>
      </div>
    );
  }

  return <PedidoActive tableId={activeTableId} order={order ?? null} tableLabel={String(activeTable.number)} zone={activeTable.zone} seats={activeTable.seats} />;
}

function PedidoActive({
  tableId,
  order,
  tableLabel,
  zone,
  seats,
}: {
  tableId: string;
  order: Order | null;
  tableLabel: string;
  zone: string;
  seats: number;
}) {
  const t = useT();
  const { data: categories = [] } = useCategories();
  const { data: items = [] } = useMenuItems();
  const { data: extras = [] } = useExtras();
  const { data: prefs = [] } = usePrefs();
  const actions = useOrderActions(tableId);
  const floor = useFloorActions();
  const { data: settings } = useSettings();
  const taxRate = (settings?.taxRate ?? 18) / 100;
  const { session } = useAuth();
  const actorName = session?.staff?.name ?? "POS";

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [modItem, setModItem] = useState<MenuItem | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [voiding, setVoiding] = useState<OrderLine | null>(null);
  // Snapshot the order + total when opening checkout, so the receipt still
  // renders after payment clears the live order.
  const [cobro, setCobro] = useState<{ order: Order; amount: number } | null>(null);

  const cat = activeCat ?? categories[0]?.id ?? null;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (!q && it.categoryId !== cat) return false;
      if (q && !`${it.name} ${it.description}`.toLowerCase().includes(q)) return false;
      if (filters.has("veg") && !it.veg) return false;
      if (filters.has("spicy") && !it.spicy) return false;
      if (filters.has("gf") && !it.gf) return false;
      return true;
    });
  }, [items, cat, search, filters]);

  async function ensureOrder(): Promise<string> {
    if (order) return order.id;
    const o = await actions.openOrder.mutateAsync(tableId);
    return o.id;
  }

  async function quickAdd(item: MenuItem) {
    const orderId = await ensureOrder();
    const line: DraftLine = {
      itemId: item.id,
      name: item.name,
      qty: 1,
      unitPrice: item.price,
      extraPrice: 0,
      modifiers: "",
    };
    await actions.addLine.mutateAsync({ orderId, line });
  }

  async function addWithMods(line: DraftLine) {
    const orderId = await ensureOrder();
    await actions.addLine.mutateAsync({ orderId, line });
  }

  const lines = order?.lines ?? [];
  const subtotal = round2(lines.reduce((s, l) => s + (l.unitPrice + l.extraPrice) * l.qty, 0));
  const igv = round2(subtotal * taxRate);
  const total = round2(subtotal + igv);
  const canSend = lines.length > 0;

  function toggleFilter(f: Filter) {
    const next = new Set(filters);
    next.has(f) ? next.delete(f) : next.add(f);
    setFilters(next);
  }

  return (
    <div className="pos-row flex h-full min-h-0">
      {/* Categories */}
      <aside className="cat-aside w-56 shrink-0 border-r border-border p-4 overflow-y-auto">
        <div className="mb-3">
          <h2 className="font-bold text-lg leading-tight">La Higuera</h2>
          <p className="text-muted text-xs">Cocina peruana de temporada</p>
        </div>
        <div className="cat-list flex flex-col gap-1">
          {categories.map((c) => {
            const count = items.filter((it) => it.categoryId === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCat(c.id);
                  setSearch("");
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
                  cat === c.id && !search
                    ? "bg-accent/20 text-accent"
                    : "hover:bg-chip-bg text-ink",
                )}
              >
                <span>{c.icon}</span>
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="text-xs text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Menu */}
      <section className="flex-1 min-w-0 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-3 mb-3 wrap-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pedido.search")}
            className="flex-1 rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <FilterChip on={filters.has("veg")} onClick={() => toggleFilter("veg")}>
              {t("pedido.filterVeg")}
            </FilterChip>
            <FilterChip on={filters.has("spicy")} onClick={() => toggleFilter("spicy")}>
              {t("pedido.filterSpicy")}
            </FilterChip>
            <FilterChip on={filters.has("gf")} onClick={() => toggleFilter("gf")}>
              {t("pedido.filterGf")}
            </FilterChip>
          </div>
        </div>

        <div className="screen-grid grid grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto pr-1">
          {shown.map((it) => (
            <MenuCard
              key={it.id}
              item={it}
              onCard={() => it.available && setModItem(it)}
              onAdd={() => it.available && quickAdd(it)}
            />
          ))}
          {shown.length === 0 && (
            <p className="text-muted text-sm col-span-full py-8 text-center">{t("pedido.noResults")}</p>
          )}
        </div>
      </section>

      {/* Cart */}
      <aside className="cart-panel w-80 shrink-0 border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-md bg-chip-bg grid place-items-center text-xs font-bold">
              M{tableLabel}
            </div>
            <div className="flex-1">
              <p className="font-semibold leading-tight">{t("pedido.orderTable")} {tableLabel}</p>
              <p className="text-muted text-xs">
                {seats} {t("pedido.guests")} · {zone}
              </p>
            </div>
            {order && (
              <button
                onClick={() => setTransferOpen(true)}
                title={t("pedido.transfer")}
                className="h-9 w-9 rounded-md bg-chip-bg border border-border grid place-items-center hover:border-accent/50"
              >
                ⇄
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {lines.length === 0 ? (
            <div className="text-center text-muted py-12">
              <div className="text-3xl mb-2">🧾</div>
              <p className="font-medium text-ink">{t("pedido.emptyTicket")}</p>
              <p className="text-xs mt-1">{t("pedido.emptyHint")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.id} className="rounded-md bg-surface-alt border border-border-soft p-2.5">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{l.name}</p>
                      {l.modifiers && <p className="text-muted text-xs truncate">{l.modifiers}</p>}
                    </div>
                    <span className="font-mono text-sm">
                      {formatMoney((l.unitPrice + l.extraPrice) * l.qty)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <QtyBtn onClick={() => actions.setQty.mutate({ lineId: l.id, qty: l.qty - 1 })}>−</QtyBtn>
                    <span className="w-6 text-center text-sm">{l.qty}</span>
                    <QtyBtn onClick={() => actions.setQty.mutate({ lineId: l.id, qty: l.qty + 1 })}>+</QtyBtn>
                    <button
                      onClick={() => setVoiding(l)}
                      className="ml-auto text-xs text-muted hover:text-warning"
                    >
                      {t("pedido.void")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-border space-y-1.5">
          <Row label={t("pedido.subtotal")} value={formatMoney(subtotal)} />
          <Row label={`IGV (${Math.round(taxRate * 100)}%)`} value={formatMoney(igv)} />
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold">{t("pedido.total")}</span>
            <span className="font-mono font-bold text-lg">{formatMoney(total)}</span>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={!canSend}
              onClick={() => order && actions.sendToKitchen.mutate(order.id)}
            >
              {t("pedido.sendKitchen")}
            </Button>
            <Button
              className="flex-1"
              disabled={!canSend}
              onClick={() => order && setCobro({ order, amount: total })}
            >
              {t("pedido.charge")}
            </Button>
          </div>
        </div>
      </aside>

      <ModifierModal
        item={modItem}
        extras={extras}
        prefs={prefs}
        onClose={() => setModItem(null)}
        onAdd={addWithMods}
      />
      {cobro && (
        <CobroModal
          open={true}
          onClose={() => setCobro(null)}
          order={cobro.order}
          amount={cobro.amount}
          taxRate={taxRate}
          onPaid={() => setCobro(null)}
        />
      )}
      {order && (
        <TransferModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          orderId={order.id}
          currentTableId={tableId}
        />
      )}
      <VoidModal
        open={!!voiding}
        lineName={voiding?.name ?? ""}
        onClose={() => setVoiding(null)}
        onConfirm={(reason) =>
          voiding && floor.voidLine.mutate({ lineId: voiding.id, reason, actor: actorName })
        }
      />
    </div>
  );
}

function MenuCard({ item, onCard, onAdd }: { item: MenuItem; onCard: () => void; onAdd: () => void }) {
  const t = useT();
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3 flex flex-col transition-colors",
        item.available ? "hover:border-accent/50 cursor-pointer" : "opacity-50",
      )}
      onClick={onCard}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="text-2xl">{item.emoji}</span>
        <div className="flex gap-1">
          {item.badge && <Badge tone="accent">{item.badge}</Badge>}
          {!item.available && <Badge tone="warning">{t("pedido.soldOut")}</Badge>}
        </div>
      </div>
      <p className="font-semibold text-sm leading-tight">{item.name}</p>
      <p className="text-muted text-xs mt-0.5 line-clamp-2 flex-1">{item.description}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="font-mono text-sm font-semibold">{formatMoney(item.price)}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          disabled={!item.available}
          className="h-7 w-7 rounded-md bg-accent-cta text-white grid place-items-center text-lg leading-none disabled:opacity-40"
          aria-label={`Agregar ${item.name}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs border transition-colors whitespace-nowrap",
        on ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border text-ink",
      )}
    >
      {children}
    </button>
  );
}

function QtyBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 rounded-md bg-chip-bg border border-border grid place-items-center text-sm"
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
