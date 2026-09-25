import { useEffect, useState } from "react";
import { useKitchenTickets, useKitchenActions } from "@/data/hooks";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { KitchenTicket, KdsColumn } from "@/data/model";

const COLUMNS: Array<{ key: KdsColumn; labelKey: string }> = [
  { key: "nuevos", labelKey: "kds.col.nuevos" },
  { key: "preparacion", labelKey: "kds.col.prep" },
  { key: "listos", labelKey: "kds.col.listos" },
];

const WARN_SEC = 300; // amber
const DELAY_SEC = 480; // blurple + pulse

function useTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Cocina() {
  useTick();
  const t = useT();
  const { data: tickets = [] } = useKitchenTickets();
  const { advance } = useKitchenActions();

  const now = Date.now();
  const delayed = tickets.filter((t) => !t.done && (now - t.enteredAt) / 1000 >= DELAY_SEC).length;
  const ready = tickets.filter((t) => t.col === "listos").length;

  return (
    <div className="h-full flex flex-col bg-shell text-white/90">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h1 className="text-xl font-bold text-white">{t("kds.title")}</h1>
          <p className="text-white/50 text-sm">{t("kds.subtitle")}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Stat label={t("kds.active")} value={tickets.length} />
          <Stat label={t("kds.delay")} value={delayed} tone={delayed ? "warn" : undefined} />
          <Stat label={t("kds.ready")} value={ready} />
        </div>
      </div>

      <div className="kds-grid grid grid-cols-3 gap-4 p-4 flex-1 min-h-0 overflow-hidden">
        {COLUMNS.map((col) => {
          const colTickets = tickets.filter((t) => t.col === col.key);
          return (
            <div key={col.key} className="flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="font-semibold text-white/80">{t(col.labelKey)}</h2>
                <span className="text-xs text-white/40">{colTickets.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {colTickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} now={now} onAdvance={() => advance.mutate(t.id)} />
                ))}
                {colTickets.length === 0 && (
                  <p className="text-white/30 text-xs text-center py-8">{t("kds.empty")}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketCard({ ticket, now, onAdvance }: { ticket: KitchenTicket; now: number; onAdvance: () => void }) {
  const t = useT();
  const sec = ticket.done ? 0 : Math.floor((now - ticket.enteredAt) / 1000);
  const delayed = sec >= DELAY_SEC;
  const warn = sec >= WARN_SEC && sec < DELAY_SEC;

  return (
    <button
      onClick={onAdvance}
      className={cn(
        "w-full text-left rounded-lg border p-3 bg-white/5 hover:bg-white/10 transition-colors",
        delayed ? "border-accent animate-pulseRed" : "border-white/10",
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-white">{ticket.tableLabel}</span>
        <span
          className={cn(
            "font-mono text-sm",
            delayed ? "text-accent-light" : warn ? "text-warning" : "text-white/60",
          )}
        >
          {ticket.col === "listos" ? t("kds.done") : fmt(sec)}
        </span>
      </div>
      <ul className="space-y-0.5">
        {ticket.lines.map((l, i) => (
          <li key={i} className="text-sm text-white/80">
            {l.qty}× {l.name}
          </li>
        ))}
      </ul>
      {ticket.note && <p className="text-xs text-white/40 mt-1">{ticket.note}</p>}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="text-center">
      <p className={cn("text-lg font-bold", tone === "warn" ? "text-warning" : "text-white")}>{value}</p>
      <p className="text-white/40 text-xs">{label}</p>
    </div>
  );
}
