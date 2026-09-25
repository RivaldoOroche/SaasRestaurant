import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useDeliveryActions, useDeliveryZones, useDrivers } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { normalizePhonePe } from "@/lib/delivery";
import type { DriverVehicle } from "@/data/model";
import { VEHICLE_ICON } from "./labels";

/** Gestión de zonas de reparto (costo y tiempo) y repartidores propios. */
export function DeliveryConfigModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"zones" | "drivers">("zones");
  return (
    <Modal open onClose={onClose} labelledBy="dl-config" className="max-w-2xl">
      <div className="p-5">
        <h2 id="dl-config" className="text-lg font-bold mb-3">
          Zonas y repartidores
        </h2>
        <div className="flex gap-2 mb-4" role="tablist">
          {(
            [
              ["zones", "Zonas de reparto"],
              ["drivers", "Repartidores"],
            ] as const
          ).map(([k, label]) => (
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
              {label}
            </button>
          ))}
        </div>
        {tab === "zones" ? <ZonesTab /> : <DriversTab />}
        <div className="flex justify-end mt-5">
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    </Modal>
  );
}

const inputCls = "rounded-md bg-chip-bg border border-border px-2 py-1.5 text-sm";

function ZonesTab() {
  const { data: zones = [] } = useDeliveryZones();
  const { saveZone, removeZone } = useDeliveryActions();
  const [name, setName] = useState("");
  const [fee, setFee] = useState("5");
  const [eta, setEta] = useState("40");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const f = Number(fee);
    const e = Number(eta);
    if (!name.trim()) return setErr("Ponle nombre a la zona.");
    if (!(f >= 0) || !(e > 0)) return setErr("Revisa el costo (≥ 0) y el tiempo (> 0).");
    setErr(null);
    saveZone.mutate({ name: name.trim(), fee: f, etaMin: Math.round(e), active: true }, { onSuccess: () => setName("") });
  }

  return (
    <div>
      <p className="text-muted text-xs mb-3">El costo de envío y el tiempo estimado se aplican al crear el pedido. El tiempo incluye la preparación.</p>
      <div className="divide-y divide-border-soft rounded-md border border-border mb-4">
        {zones.length === 0 && <p className="text-muted text-sm p-3">Aún no hay zonas.</p>}
        {zones.map((z) => (
          <div key={z.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
            <input
              defaultValue={z.name}
              aria-label="Nombre de la zona"
              onBlur={(e) => e.target.value.trim() && e.target.value !== z.name && saveZone.mutate({ ...z, name: e.target.value.trim() })}
              className={cn(inputCls, "flex-1 min-w-[8rem]")}
            />
            <label className="flex items-center gap-1 text-xs text-muted">
              S/
              <input
                type="number"
                min={0}
                step="0.5"
                defaultValue={z.fee}
                aria-label="Costo de envío"
                onBlur={(e) => Number(e.target.value) !== z.fee && Number(e.target.value) >= 0 && saveZone.mutate({ ...z, fee: Number(e.target.value) })}
                className={cn(inputCls, "w-20 font-mono")}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="number"
                min={5}
                defaultValue={z.etaMin}
                aria-label="Tiempo estimado en minutos"
                onBlur={(e) => Number(e.target.value) !== z.etaMin && Number(e.target.value) > 0 && saveZone.mutate({ ...z, etaMin: Math.round(Number(e.target.value)) })}
                className={cn(inputCls, "w-16 font-mono")}
              />
              min
            </label>
            <ActiveToggle active={z.active} onChange={(v) => saveZone.mutate({ ...z, active: v })} />
            <button className="text-warning px-1" aria-label={`Eliminar zona ${z.name}`} onClick={() => removeZone.mutate(z.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-alt border border-border-soft p-3">
        <label className="flex-1 min-w-[8rem] text-xs text-muted">
          Nueva zona
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. San Borja" className={cn(inputCls, "w-full mt-1")} />
        </label>
        <label className="text-xs text-muted">
          Envío S/
          <input type="number" min={0} step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} className={cn(inputCls, "w-20 mt-1 block font-mono")} />
        </label>
        <label className="text-xs text-muted">
          Minutos
          <input type="number" min={5} value={eta} onChange={(e) => setEta(e.target.value)} className={cn(inputCls, "w-16 mt-1 block font-mono")} />
        </label>
        <Button size="sm" onClick={add} disabled={saveZone.isPending}>
          Agregar
        </Button>
      </div>
      {err && <p className="text-warning text-xs mt-2">{err}</p>}
    </div>
  );
}

function DriversTab() {
  const { data: drivers = [] } = useDrivers();
  const { saveDriver, removeDriver } = useDeliveryActions();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState<DriverVehicle>("moto");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const p = normalizePhonePe(phone);
    if (!name.trim()) return setErr("Ingresa el nombre del repartidor.");
    if (!p) return setErr("Celular inválido (9 dígitos, empieza en 9).");
    setErr(null);
    saveDriver.mutate(
      { name: name.trim(), phone: p, vehicle, active: true },
      {
        onSuccess: () => {
          setName("");
          setPhone("");
        },
      },
    );
  }

  return (
    <div>
      <p className="text-muted text-xs mb-3">Solo los repartidores activos aparecen al despachar. Desactiva a quien no esté en turno.</p>
      <div className="divide-y divide-border-soft rounded-md border border-border mb-4">
        {drivers.length === 0 && <p className="text-muted text-sm p-3">Aún no hay repartidores.</p>}
        {drivers.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
            <span aria-hidden="true">{VEHICLE_ICON[d.vehicle]}</span>
            <span className="flex-1 min-w-[8rem] font-medium">{d.name}</span>
            <span className="text-muted font-mono text-xs">{d.phone}</span>
            <ActiveToggle active={d.active} onChange={(v) => saveDriver.mutate({ ...d, active: v })} />
            <button className="text-warning px-1" aria-label={`Eliminar a ${d.name}`} onClick={() => removeDriver.mutate(d.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-alt border border-border-soft p-3">
        <label className="flex-1 min-w-[8rem] text-xs text-muted">
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, "w-full mt-1")} />
        </label>
        <label className="text-xs text-muted">
          Celular
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={cn(inputCls, "w-32 mt-1 block")} />
        </label>
        <label className="text-xs text-muted">
          Vehículo
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value as DriverVehicle)} className={cn(inputCls, "mt-1 block")}>
            <option value="moto">🛵 Moto</option>
            <option value="bici">🚲 Bici</option>
            <option value="auto">🚗 Auto</option>
          </select>
        </label>
        <Button size="sm" onClick={add} disabled={saveDriver.isPending}>
          Agregar
        </Button>
      </div>
      {err && <p className="text-warning text-xs mt-2">{err}</p>}
    </div>
  );
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs border",
        active ? "bg-success/15 border-success/50 text-success" : "bg-chip-bg border-border text-muted",
      )}
    >
      {active ? "Activo" : "Inactivo"}
    </button>
  );
}
