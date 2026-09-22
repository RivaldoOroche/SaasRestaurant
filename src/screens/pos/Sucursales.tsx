import { useState } from "react";
import {
  useActivityLog,
  useBranchSales,
  useBranches,
  useBranchActions,
  useStaff,
  useStaffActions,
} from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { StaffRole } from "@/data/model";

const ROLE_LABEL: Record<StaffRole, string> = { dueno: "Dueño", admin: "Gerente", mesero: "Mesero" };

export function Sucursales() {
  const { data: log = [] } = useActivityLog();
  const { data: sales = [] } = useBranchSales();
  const max = Math.max(1, ...sales.map((b) => b.sales));
  const totalSales = Math.round(sales.reduce((s, b) => s + b.sales, 0) * 100) / 100;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="Dueño" subtitle="Sucursales, personal y bitácora de actividad" />

      <Card className="mb-4">
        <CardBody>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold">Ventas por sucursal</h3>
            <span className="text-sm text-muted">
              Total <span className="font-mono text-ink">{formatMoney(totalSales)}</span>
            </span>
          </div>
          {sales.length === 0 ? (
            <p className="text-muted text-sm">Aún no hay ventas registradas.</p>
          ) : (
            <div className="space-y-3">
              {sales.map((b) => (
                <div key={b.branchId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      {b.name} <span className="text-muted">· {b.city}</span>
                    </span>
                    <span className="font-mono">
                      {formatMoney(b.sales)} <span className="text-muted text-xs">· {b.orders} ped.</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(b.sales / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <BranchesCard />
      <StaffCard />

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-3">Bitácora de actividad</h3>
          {log.length === 0 ? (
            <p className="text-muted text-sm">Sin actividad registrada aún.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {log.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="font-mono text-muted shrink-0">{e.at}</span>
                  <span className="text-accent shrink-0">{e.actor}</span>
                  <span className="text-ink">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function BranchesCard() {
  const { data: branches = [] } = useBranches();
  const { addBranch, updateBranch, removeBranch } = useBranchActions();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <h3 className="font-semibold">Sucursales</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[8rem]">
            <label className="text-xs text-muted">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Surco"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="flex-1 min-w-[8rem]">
            <label className="text-xs text-muted">Ciudad</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lima"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm" />
          </div>
          <Button
            size="sm"
            disabled={!name.trim() || addBranch.isPending}
            onClick={() => {
              addBranch.mutate({ name: name.trim(), city: city.trim() || "—" });
              setName("");
              setCity("");
            }}
          >
            Agregar
          </Button>
        </div>
        {err && <p className="text-warning text-xs">{err}</p>}
        <div className="divide-y divide-border-soft">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-2">
              <input defaultValue={b.name}
                onBlur={(e) => e.target.value !== b.name && updateBranch.mutate({ id: b.id, patch: { name: e.target.value } })}
                className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1 text-sm" />
              <input defaultValue={b.city}
                onBlur={(e) => e.target.value !== b.city && updateBranch.mutate({ id: b.id, patch: { city: e.target.value } })}
                className="w-32 rounded-md bg-chip-bg border border-border px-2 py-1 text-sm" />
              <button
                onClick={() => { setErr(null); removeBranch.mutate(b.id, { onError: (e) => setErr((e as Error).message) }); }}
                className="text-warning text-sm" title="Eliminar sucursal">✕</button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function StaffCard() {
  const { data: staff = [] } = useStaff();
  const { addStaff, updateStaff, setStaffPin } = useStaffActions();
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("mesero");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function agregar() {
    setErr(null);
    if (!name.trim() || !/^\d{4}$/.test(pin)) {
      setErr("Ingresa nombre y un PIN de 4 dígitos.");
      return;
    }
    addStaff.mutate({ name: name.trim(), role, pin });
    setName("");
    setPin("");
    setRole("mesero");
  }

  function resetPin(id: string) {
    const p = window.prompt("Nuevo PIN (4 dígitos):");
    if (p == null) return;
    if (!/^\d{4}$/.test(p)) {
      setErr("El PIN debe tener 4 dígitos.");
      return;
    }
    setErr(null);
    setStaffPin.mutate({ id, pin: p });
  }

  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <h3 className="font-semibold">Personal</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[8rem]">
            <label className="text-xs text-muted">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted block">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}
              className="rounded-md bg-chip-bg border border-border px-2 py-2 text-sm">
              <option value="mesero">Mesero</option>
              <option value="admin">Gerente</option>
              <option value="dueno">Dueño</option>
            </select>
          </div>
          <div className="w-24">
            <label className="text-xs text-muted">PIN</label>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric" placeholder="4 díg." maxLength={4}
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono" />
          </div>
          <Button size="sm" onClick={agregar} disabled={addStaff.isPending}>Agregar</Button>
        </div>
        {err && <p className="text-warning text-xs">{err}</p>}
        <div className="divide-y divide-border-soft">
          {staff.map((m) => (
            <div key={m.id} className={cn("flex items-center gap-3 py-2", !m.active && "opacity-50")}>
              <span className="h-8 w-8 shrink-0 grid place-items-center rounded-full bg-accent/20 text-accent text-xs font-bold">
                {m.initials}
              </span>
              <input defaultValue={m.name}
                onBlur={(e) => e.target.value !== m.name && updateStaff.mutate({ id: m.id, patch: { name: e.target.value } })}
                className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1 text-sm" />
              <select value={m.role} onChange={(e) => updateStaff.mutate({ id: m.id, patch: { role: e.target.value as StaffRole } })}
                className="rounded-md bg-chip-bg border border-border px-2 py-1 text-sm">
                {(["mesero", "admin", "dueno"] as StaffRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              <button onClick={() => resetPin(m.id)} className="text-accent text-xs hover:underline shrink-0" title="Cambiar PIN">
                PIN
              </button>
              <button
                onClick={() => updateStaff.mutate({ id: m.id, patch: { active: !m.active } })}
                className="text-muted text-xs hover:underline shrink-0"
              >
                {m.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-muted text-[11px]">
          El PIN se guarda cifrado en el servidor. El ingreso por PIN se habilita en el dispositivo del local.
        </p>
      </CardBody>
    </Card>
  );
}
