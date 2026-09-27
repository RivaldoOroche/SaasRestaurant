// Personal: quién entra al POS, con qué rol, con qué PIN y en qué sucursales.
import { useState } from "react";
import { useBranches, useStaff, useStaffActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { buildTree, flatten } from "@/lib/branchTree";
import type { StaffMember, StaffRole } from "@/data/model";

const ROLES: { key: StaffRole; label: string; can: string }[] = [
  { key: "mesero", label: "Mesero", can: "Toma pedidos, envía a cocina, cobra y ve sus propias ventas." },
  { key: "admin", label: "Gerente", can: "Además abre y cierra caja, edita la carta y el inventario, emite comprobantes y ve reportes." },
  { key: "dueno", label: "Dueño(a)", can: "Todo, incluido el personal, las sucursales, los permisos y el plan." },
];
const roleLabel = (r: StaffRole) => ROLES.find((x) => x.key === r)?.label ?? r;
const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";
const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

export function Personal() {
  const { data: staff = [], isLoading } = useStaff();
  const { data: branches = [] } = useBranches();
  const { updateStaff } = useStaffActions();
  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const [pinFor, setPinFor] = useState<StaffMember | null>(null);
  const [assigning, setAssigning] = useState<StaffMember | null>(null);
  const [confirmOff, setConfirmOff] = useState<StaffMember | null>(null);
  const multi = branches.filter((b) => b.active !== false).length > 1;

  const branchSummary = (ids: string[]) =>
    ids.length === 0 ? "Todas las sucursales" : ids.length === 1 ? branches.find((b) => b.id === ids[0])?.name ?? "1 sucursal" : `${ids.length} sucursales`;
  const sorted = [...staff].sort((a, b) => Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name, "es"));

  return (
    <div className="p-6 mob:p-4 max-w-3xl">
      <ScreenHeader
        title="Personal"
        subtitle="Quién puede entrar al POS y con qué PIN"
        actions={<Button onClick={() => setEditing("new")}>＋ Agregar persona</Button>}
      />

      {isLoading ? (
        <p className="text-muted">Cargando…</p>
      ) : (
        <Card className="divide-y divide-border">
          {sorted.map((m) => (
            <div key={m.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 p-3", !m.active && "opacity-60")}>
              <span className="h-10 w-10 shrink-0 grid place-items-center rounded-full bg-accent/20 text-accent text-sm font-bold" aria-hidden="true">
                {m.initials}
              </span>
              <div className="flex-1 min-w-[10rem]">
                <p className="font-medium flex flex-wrap items-center gap-1.5">
                  {m.name}
                  <Badge tone={m.role === "mesero" ? "neutral" : "accent"}>{roleLabel(m.role)}</Badge>
                  {!m.active && <Badge tone="warning">Sin acceso</Badge>}
                </p>
                {multi && m.role !== "dueno" && <p className="text-xs text-muted">🏬 {branchSummary(m.branchIds ?? [])}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing(m)} aria-label={`Editar a ${m.name}`}>
                  Editar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPinFor(m)} aria-label={`Cambiar PIN de ${m.name}`}>
                  PIN
                </Button>
                {multi && m.role !== "dueno" && (
                  <Button size="sm" variant="secondary" onClick={() => setAssigning(m)} aria-label={`Sucursales de ${m.name}`}>
                    Sucursales
                  </Button>
                )}
                {m.active ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmOff(m)}>
                    Quitar acceso
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => updateStaff.mutate({ id: m.id, patch: { active: true } })}>
                    Devolver acceso
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
      <p className="text-muted text-xs mt-3">
        Cada persona entra con su propio PIN, así las ventas y los cobros quedan a su nombre. Funciona sin internet en los equipos ya
        vinculados. El PIN nunca se guarda: solo un verificador cifrado.
      </p>

      {editing && <StaffModal member={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {pinFor && <PinModal member={pinFor} onClose={() => setPinFor(null)} />}
      {assigning && (
        <AssignBranches
          member={assigning}
          onClose={() => setAssigning(null)}
          onSave={(ids) => {
            updateStaff.mutate({ id: assigning.id, patch: { branchIds: ids } });
            setAssigning(null);
          }}
        />
      )}
      {confirmOff && (
        <Modal open onClose={() => setConfirmOff(null)} labelledBy="off-title">
          <div className="p-5 space-y-3">
            <h2 id="off-title" className="text-lg font-bold">
              ¿Quitar el acceso a {confirmOff.name}?
            </h2>
            <p className="text-sm text-muted">No podrá entrar con su PIN. Sus ventas y cobros anteriores se conservan. Puedes devolverle el acceso cuando quieras.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOff(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  updateStaff.mutate({ id: confirmOff.id, patch: { active: false } });
                  setConfirmOff(null);
                }}
              >
                Quitar acceso
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RolePicker({ value, onChange }: { value: StaffRole; onChange: (r: StaffRole) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs text-muted mb-1">Rol</legend>
      {ROLES.map((r) => (
        <label
          key={r.key}
          className={cn("flex gap-2 rounded-md border p-2.5 cursor-pointer", value === r.key ? "border-accent bg-accent/10" : "border-border bg-chip-bg")}
        >
          <input type="radio" name="role" checked={value === r.key} onChange={() => onChange(r.key)} className="mt-1" />
          <span>
            <span className="text-sm font-semibold">{r.label}</span>
            <span className="block text-xs text-muted">{r.can}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">PIN de 4 dígitos</span>
      <span className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          aria-label="PIN de 4 dígitos"
          className={`${field} font-mono text-lg tracking-[0.4em] w-32`}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange(randomPin())}>
          Generar
        </Button>
      </span>
      <span className="text-xs text-muted">Díselo en persona; no lo anotes a la vista. Cada persona debe tener uno distinto.</span>
    </label>
  );
}

function StaffModal({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { addStaff, updateStaff } = useStaffActions();
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<StaffRole>(member?.role ?? "mesero");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("Escribe el nombre.");
    try {
      if (member) await updateStaff.mutateAsync({ id: member.id, patch: { name: name.trim(), role } });
      else {
        if (!/^\d{4}$/.test(pin)) return setErr("El PIN debe tener 4 dígitos (o toca «Generar»).");
        await addStaff.mutateAsync({ name: name.trim(), role, pin });
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="staff-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="staff-title" className="text-lg font-bold">
          {member ? `Editar a ${member.name}` : "Agregar persona"}
        </h2>
        <label className="block">
          <span className="text-xs text-muted">Nombre y apellido</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Rosa Quispe" className={field} />
        </label>
        <RolePicker value={role} onChange={setRole} />
        {!member && <PinInput value={pin} onChange={setPin} />}
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={addStaff.isPending || updateStaff.isPending}>
            {member ? "Guardar" : "Agregar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PinModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { setStaffPin } = useStaffActions();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} labelledBy="pin-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          setStaffPin.mutate({ id: member.id, pin }, { onSuccess: onClose, onError: (x) => setErr((x as Error).message) });
        }}
      >
        <h2 id="pin-title" className="text-lg font-bold">
          Nuevo PIN para {member.name}
        </h2>
        <PinInput value={pin} onChange={setPin} />
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pin.length !== 4 || setStaffPin.isPending}>
            Guardar PIN
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Elegir en qué sucursales trabaja una persona (ninguna marcada = todas). */
function AssignBranches({ member, onClose, onSave }: { member: StaffMember; onClose: () => void; onSave: (ids: string[]) => void }) {
  const { data: branches = [] } = useBranches();
  const [sel, setSel] = useState<string[]>(member.branchIds ?? []);
  const all = sel.length === 0;
  const tree = flatten(buildTree(branches.filter((b) => b.active !== false)));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <Modal open onClose={onClose} labelledBy="assign-title">
      <div className="p-5 space-y-3">
        <h2 id="assign-title" className="text-lg font-bold">
          ¿Dónde trabaja {member.name}?
        </h2>
        <p className="text-sm text-muted">Al entrar con su PIN solo verá y operará en estas sucursales.</p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={all} onChange={() => setSel([])} />
          Todas las sucursales
        </label>
        <div className="space-y-1.5 pl-1">
          {tree.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${b.depth * 1.1}rem` }}>
              <input type="checkbox" checked={sel.includes(b.id)} onChange={() => toggle(b.id)} />
              {b.name}
              {!b.parentId && <span className="text-xs text-muted">(principal)</span>}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(sel)}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
