import { useState } from "react";
import { useReservations, useWaitlist, useReservaActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { Reservation, ReservationStatus, WaitlistStatus } from "@/data/model";

const RES_TONE: Record<ReservationStatus, "warning" | "accent" | "success" | "neutral"> = {
  pendiente: "warning",
  confirmada: "accent",
  sentada: "success",
  cancelada: "neutral",
};
const RES_NEXT: Record<ReservationStatus, ReservationStatus | null> = {
  pendiente: "confirmada",
  confirmada: "sentada",
  sentada: null,
  cancelada: null,
};
const WL_TONE: Record<WaitlistStatus, "warning" | "accent" | "success" | "neutral"> = {
  esperando: "warning",
  llamado: "accent",
  sentado: "success",
  retirado: "neutral",
};

const today = () => new Date().toISOString().slice(0, 10);

export function Reservas() {
  const { data: reservations = [] } = useReservations();
  const { data: waitlist = [] } = useWaitlist();
  const [dateFilter, setDateFilter] = useState(today());
  const shown = reservations.filter((r) => r.date === dateFilter);

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader title="Reservas y lista de espera" subtitle="Gestiona reservas del día y la cola de espera" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-muted">Reservas</p>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-md bg-chip-bg border border-border px-2 py-1 text-xs"
            />
          </div>
          <NewReservation date={dateFilter} />
          <div className="space-y-2 mt-3">
            {shown.length === 0 ? (
              <Card className="p-4 text-center text-muted text-sm">Sin reservas para esta fecha.</Card>
            ) : (
              shown.map((r) => <ReservationRow key={r.id} r={r} />)
            )}
          </div>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide text-muted mb-2">Lista de espera</p>
          <NewWaitlist />
          <div className="space-y-2 mt-3">
            {waitlist.length === 0 ? (
              <Card className="p-4 text-center text-muted text-sm">Nadie en espera.</Card>
            ) : (
              waitlist.map((w) => <WaitRow key={w.id} w={w} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReservationRow({ r }: { r: Reservation }) {
  const { updateReservation, removeReservation } = useReservaActions();
  const next = RES_NEXT[r.status];
  return (
    <Card className={cn("p-3 flex flex-wrap items-center gap-x-3 gap-y-2", r.status === "cancelada" && "opacity-60")}>
      <div className="flex-1 min-w-0 mob:basis-full">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold">{r.name}</p>
          <Badge tone={RES_TONE[r.status]}>{r.status}</Badge>
        </div>
        <p className="text-muted text-xs">
          {r.atTime} · {r.partySize} pers · {r.zone}
          {r.phone ? ` · ${r.phone}` : ""}
        </p>
      </div>
      {next && (
        <Button size="sm" variant="secondary" onClick={() => updateReservation.mutate({ id: r.id, patch: { status: next } })}>
          {next === "confirmada" ? "Confirmar" : "Sentar"}
        </Button>
      )}
      {r.status !== "cancelada" && r.status !== "sentada" && (
        <Button size="sm" variant="ghost" onClick={() => updateReservation.mutate({ id: r.id, patch: { status: "cancelada" } })}>
          Cancelar
        </Button>
      )}
      <button className="text-muted hover:text-ink text-sm" title="Eliminar" onClick={() => removeReservation.mutate(r.id)}>
        ✕
      </button>
    </Card>
  );
}

function WaitRow({ w }: { w: { id: string; name: string; phone?: string; partySize: number; waitLabel: string; status: WaitlistStatus } }) {
  const { updateWaitlist, removeWaitlist } = useReservaActions();
  return (
    <Card className={cn("p-3 flex flex-wrap items-center gap-x-3 gap-y-2", (w.status === "retirado" || w.status === "sentado") && "opacity-60")}>
      <div className="flex-1 min-w-0 mob:basis-full">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold">{w.name}</p>
          <Badge tone={WL_TONE[w.status]}>{w.status}</Badge>
        </div>
        <p className="text-muted text-xs">
          {w.partySize} pers · {w.waitLabel}
          {w.phone ? ` · ${w.phone}` : ""}
        </p>
      </div>
      {w.status === "esperando" && (
        <Button size="sm" variant="secondary" onClick={() => updateWaitlist.mutate({ id: w.id, patch: { status: "llamado" } })}>
          Llamar
        </Button>
      )}
      {(w.status === "esperando" || w.status === "llamado") && (
        <Button size="sm" onClick={() => updateWaitlist.mutate({ id: w.id, patch: { status: "sentado" } })}>
          Sentar
        </Button>
      )}
      <button className="text-muted hover:text-ink text-sm" title="Quitar" onClick={() => removeWaitlist.mutate(w.id)}>
        ✕
      </button>
    </Card>
  );
}

function NewReservation({ date }: { date: string }) {
  const { addReservation } = useReservaActions();
  const [f, setF] = useState({ name: "", phone: "", partySize: 2, zone: "Salón", atTime: "20:00" });
  const input = "rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm";
  return (
    <Card className="p-3 grid grid-cols-2 gap-2">
      <input className={input} placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={input} placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input className={input} type="time" value={f.atTime} onChange={(e) => setF({ ...f, atTime: e.target.value })} />
      <input className={input} type="number" min={1} placeholder="Personas" value={f.partySize} onChange={(e) => setF({ ...f, partySize: Number(e.target.value) })} />
      <select className={`${input} col-span-1`} value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })}>
        <option>Salón</option>
        <option>Terraza</option>
        <option>Barra</option>
        <option>Privado</option>
      </select>
      <Button
        size="sm"
        disabled={!f.name || addReservation.isPending}
        onClick={() => {
          addReservation.mutate({ ...f, date });
          setF({ name: "", phone: "", partySize: 2, zone: "Salón", atTime: "20:00" });
        }}
      >
        + Reserva
      </Button>
    </Card>
  );
}

function NewWaitlist() {
  const { addWaitlist } = useReservaActions();
  const [f, setF] = useState({ name: "", phone: "", partySize: 2, waitLabel: "~15 min" });
  const input = "rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm";
  return (
    <Card className="p-3 grid grid-cols-2 gap-2">
      <input className={input} placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={input} placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input className={input} type="number" min={1} placeholder="Personas" value={f.partySize} onChange={(e) => setF({ ...f, partySize: Number(e.target.value) })} />
      <input className={input} placeholder="Espera (~15 min)" value={f.waitLabel} onChange={(e) => setF({ ...f, waitLabel: e.target.value })} />
      <Button
        size="sm"
        className="col-span-2"
        disabled={!f.name || addWaitlist.isPending}
        onClick={() => {
          addWaitlist.mutate(f);
          setF({ name: "", phone: "", partySize: 2, waitLabel: "~15 min" });
        }}
      >
        + A la cola
      </Button>
    </Card>
  );
}
