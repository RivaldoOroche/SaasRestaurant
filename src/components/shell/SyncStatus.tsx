// Estado de conexión y sincronización del POS, siempre a la vista:
//   · botón en el riel / hoja "Más" con el estado y cuántos cambios esperan,
//   · franja bajo la barra superior cuando no hay red o algo necesita revisión,
//   · panel con el detalle, "Sincronizar ahora", "Trabajar sin conexión" y las
//     operaciones que el servidor no aceptó (p. ej. una mesa cobrada en otro equipo).
import { useState } from "react";
import { create } from "zustand";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useRepo, useSyncStatus } from "@/data/hooks";
import { useConnection } from "@/store/connection";
import { describeOp } from "@/data/pos/ops";
import { cn } from "@/lib/cn";

const usePanel = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

type Tone = "ok" | "busy" | "offline" | "alert";

function useSummary() {
  const s = useSyncStatus();
  const online = useConnection((c) => c.online);
  const tone: Tone = s.rejected.length ? "alert" : !online || !s.online ? "offline" : s.pending || s.syncing ? "busy" : "ok";
  const label =
    tone === "alert"
      ? `${s.rejected.length} ${s.rejected.length === 1 ? "cambio necesita" : "cambios necesitan"} revisión`
      : tone === "offline"
        ? s.pending
          ? `Sin conexión · ${s.pending} ${s.pending === 1 ? "cambio" : "cambios"} en cola`
          : "Sin conexión"
        : tone === "busy"
          ? `Sincronizando ${s.pending || ""}`.trim()
          : "En línea · todo sincronizado";
  return { s, online, tone, label };
}

const ICON: Record<Tone, string> = { ok: "📶", busy: "🔄", offline: "📴", alert: "⚠️" };

/** Botón compacto (riel de escritorio y hoja "Más" en móvil). */
export function SyncButton({ className }: { className?: string }) {
  const { s, tone, label } = useSummary();
  const open = usePanel((p) => p.set);
  const count = tone === "alert" ? s.rejected.length : s.pending;
  return (
    <button onClick={() => open(true)} title={label} aria-label={`Conexión: ${label}. Ver detalle`} className={cn("relative", className)}>
      <span aria-hidden="true" className={cn(tone === "busy" && "inline-block animate-spin [animation-duration:2s]")}>
        {ICON[tone]}
      </span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold grid place-items-center text-white",
            tone === "alert" ? "bg-warning" : "bg-accent",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/** Franja informativa: solo aparece cuando hay algo que decir. */
export function SyncBanner() {
  const { s, tone } = useSummary();
  const open = usePanel((p) => p.set);
  if (tone === "ok" || tone === "busy") return null;
  return (
    <button
      onClick={() => open(true)}
      className={cn(
        "w-full px-4 py-1.5 text-sm text-center no-print",
        tone === "alert" ? "bg-warning/20 text-warning font-semibold" : "bg-warning/15 text-warning",
      )}
    >
      {tone === "alert"
        ? `⚠️ ${s.rejected.length} ${s.rejected.length === 1 ? "cambio no se pudo aplicar" : "cambios no se pudieron aplicar"} (otro equipo ya lo había modificado). Toca para revisar.`
        : `📴 Sin conexión — sigue tomando pedidos y cobrando con normalidad.${
            s.pending ? ` ${s.pending} ${s.pending === 1 ? "cambio se sincronizará" : "cambios se sincronizarán"} solos al volver internet.` : ""
          }`}
    </button>
  );
}

/** Panel de detalle (uno solo, montado en el AppShell). */
export function SyncPanel() {
  const { s, online, label } = useSummary();
  const { open, set } = usePanel();
  const repo = useRepo();
  const forcedOffline = useConnection((c) => c.forcedOffline);
  const network = useConnection((c) => c.network);
  const setOnline = useConnection((c) => c.setOnline);
  const [busy, setBusy] = useState(false);

  async function syncNow() {
    setBusy(true);
    try {
      await repo.syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => set(false)} labelledBy="sync-title">
      <div className="p-5 space-y-4">
        <div>
          <h2 id="sync-title" className="text-lg font-bold">
            Conexión y sincronización
          </h2>
          <p className="text-sm text-muted mt-0.5">{label}</p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-chip-bg p-3">
            <dt className="text-muted text-xs">Cambios en cola</dt>
            <dd className="font-mono text-lg font-bold">{s.pending}</dd>
          </div>
          <div className="rounded-md bg-chip-bg p-3">
            <dt className="text-muted text-xs">Última sincronización</dt>
            <dd className="font-mono text-sm font-semibold mt-1">
              {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </dd>
          </div>
        </dl>

        <p className="text-sm text-muted">
          Sin internet el POS sigue funcionando: pedidos, comandas, cobros, delivery y comprobantes se guardan en este
          equipo y se envían solos al volver la conexión, con la hora real en que ocurrieron. Nada se duplica aunque se
          reenvíe.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={syncNow} disabled={busy || !online}>
            {busy ? "Sincronizando…" : "Sincronizar ahora"}
          </Button>
          <Button variant="secondary" onClick={() => setOnline(forcedOffline)} aria-pressed={forcedOffline}>
            {forcedOffline ? "Volver a trabajar en línea" : "Trabajar sin conexión"}
          </Button>
        </div>
        {!network && <p className="text-xs text-warning">El equipo no detecta red (wifi o datos).</p>}

        {s.rejected.length > 0 && (
          <section aria-labelledby="sync-rejected">
            <h3 id="sync-rejected" className="font-semibold text-warning">
              No se pudieron aplicar
            </h3>
            <p className="text-xs text-muted mb-2">
              Otro equipo modificó lo mismo antes. Revisa y rehaz la acción si aún corresponde.
            </p>
            <ul className="space-y-2">
              {s.rejected.map((r) => (
                <li key={r.op.id} className="rounded-md border border-warning/40 p-2 text-sm flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{describeOp(r.op)}</div>
                    <div className="text-muted text-xs">
                      {r.op.actor} · {new Date(r.op.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="text-warning text-xs mt-0.5">{r.error}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => repo.dismissRejected(r.op.id)}>
                    Entendido
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => set(false)}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
