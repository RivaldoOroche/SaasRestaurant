// Piezas compartidas de las pantallas del comedor: recarga/abono, ficha del
// comensal, movimientos del monedero y etiquetas.
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  useCashSessions,
  useCategories,
  useComedorActions,
  useMovimientos,
  useResponsables,
  useSettings,
  useSunatActions,
  useTaxRate,
} from "@/data/hooks";
import { useBranchStore } from "@/store/branch";
import { useConnection } from "@/store/connection";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney, round2 } from "@/lib/money";
import { splitIncluded } from "@/lib/tax";
import { abonoVigente, localDate, PLAN_LABEL, TIPO_LABEL, type ComedorPlan, type ComensalTipo } from "@/lib/comedor";
import { cn } from "@/lib/cn";
import type { Comensal, ComensalInput, RecargaInput } from "@/data/model";

export const field = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";

/** Fecha corta en español: «mar 14 oct». */
export function fechaCorta(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
}

export function PlanBadge({ c, date = localDate() }: { c: Pick<Comensal, "plan" | "abonoHasta">; date?: string }) {
  if (c.plan === "convenio") return <Badge tone="accent">Convenio</Badge>;
  if (c.plan === "abono")
    return abonoVigente(c, date) ? (
      <Badge tone="success">Abono hasta {fechaCorta(c.abonoHasta!)}</Badge>
    ) : (
      <Badge tone="warning">Abono vencido</Badge>
    );
  return <Badge tone="neutral">Prepago</Badge>;
}

export function saldoTone(balance: number, minimo: number): string {
  return balance < minimo ? "text-warning" : "text-ink";
}

/** Último día del mes de `date`. */
function finDeMes(d = new Date()): string {
  return localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

const METHODS: { key: RecargaInput["method"]; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "yape", label: "Yape" },
  { key: "plin", label: "Plin" },
  { key: "transferencia", label: "Transferencia" },
  { key: "tarjeta", label: "Tarjeta" },
];

/** Recarga de saldo o pago del abono mensual, con boleta opcional. */
export function RecargaModal({ comensal, onClose }: { comensal: Comensal; onClose: () => void }) {
  const { session } = useAuth();
  const { data: settings } = useSettings();
  const { recargar } = useComedorActions();
  const { emit } = useSunatActions();
  const rate = useTaxRate();
  const online = useConnection((s) => s.online);
  const branchId = useBranchStore((s) => s.branchId);
  const { data: cash = [] } = useCashSessions();
  const [mode, setMode] = useState<"recarga" | "abono">(comensal.plan === "abono" ? "abono" : "recarga");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<RecargaInput["method"]>("yape");
  const [hasta, setHasta] = useState(finDeMes());
  const [note, setNote] = useState("");
  const billing = !!settings?.billingProvider && settings.billingProvider !== "ninguno";
  const [boleta, setBoleta] = useState(billing);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const cajaAbierta = cash.some((c) => c.status === "abierta");
  const value = Number(amount.replace(",", "."));

  async function submit() {
    setErr(null);
    if (!(value > 0)) return setErr("Escribe el monto recibido.");
    if (method === "efectivo" && !cajaAbierta) return setErr("Abre la caja para recibir efectivo (Caja → Abrir caja).");
    try {
      const m = await recargar.mutateAsync({
        comensalId: comensal.id,
        amount: round2(value),
        method,
        note: note.trim() || undefined,
        actor: session?.staff?.name ?? "Caja",
        branchId,
        abonoHasta: mode === "abono" ? hasta : null,
      });
      if (boleta) {
        const { base, tax } = splitIncluded(round2(value), rate);
        await emit.mutateAsync({
          input: {
            tipo: "Boleta",
            buyerName: comensal.name,
            subtotal: base,
            igv: tax,
            total: round2(value),
            reference: mode === "abono" ? `Abono comedor hasta ${hasta} · ${comensal.name}` : `Recarga de saldo comedor · ${comensal.name}`,
          },
          online,
        });
      }
      setDone(
        mode === "abono"
          ? `Abono registrado: ${comensal.name} come hasta el ${fechaCorta(hasta)}.`
          : `Recarga registrada. Nuevo saldo: ${formatMoney(m.balanceAfter)}.`,
      );
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="recarga-title">
      <div className="p-5 space-y-4">
        <div>
          <h2 id="recarga-title" className="text-lg font-bold">
            {mode === "abono" ? "Pago de abono" : "Recarga de saldo"}
          </h2>
          <p className="text-sm text-muted">
            {comensal.name} · {comensal.grupo || TIPO_LABEL[comensal.tipo]} · saldo {formatMoney(comensal.balance)}
          </p>
        </div>
        {done ? (
          <>
            <p role="status" className="rounded-md bg-success/10 border border-success/40 text-success p-3 text-sm">
              {done}
              {boleta && " Se emitió la boleta."}
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Listo</Button>
            </div>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="flex gap-1 rounded-lg bg-chip-bg p-1" role="radiogroup" aria-label="Tipo de pago">
              {(["recarga", "abono"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={mode === k}
                  onClick={() => setMode(k)}
                  className={cn("flex-1 rounded-md py-1.5 text-sm", mode === k ? "bg-surface font-semibold shadow" : "text-muted")}
                >
                  {k === "recarga" ? "Saldo prepago" : "Abono mensual"}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-xs text-muted">Monto recibido (S/)</span>
              <input
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                className={`${field} font-mono text-lg`}
              />
            </label>
            {mode === "recarga" ? (
              <div className="flex flex-wrap gap-2">
                {[20, 50, 100, 150].map((v) => (
                  <Button key={v} type="button" size="sm" variant="secondary" onClick={() => setAmount(String(v))}>
                    S/ {v}
                  </Button>
                ))}
              </div>
            ) : (
              <label className="block">
                <span className="text-xs text-muted">Cubre el menú hasta</span>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={field} />
                <span className="text-xs text-muted">El abono no suma saldo: el menú se entrega sin cobrar hasta esa fecha.</span>
              </label>
            )}
            <div>
              <span className="text-xs text-muted">Medio de pago</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={method === m.key}
                    onClick={() => setMethod(m.key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm border",
                      method === m.key ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {method === "efectivo" && !cajaAbierta && <p className="text-xs text-warning mt-1">La caja está cerrada: ábrela para recibir efectivo.</p>}
              {(method === "yape" || method === "plin") && settings?.yapeNumber && (
                <p className="text-xs text-muted mt-1">Confirma en el celular del comedor ({settings.yapeNumber}) que llegó el pago.</p>
              )}
            </div>
            <label className="block">
              <span className="text-xs text-muted">Nota (opcional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. N.° de operación" className={field} />
            </label>
            <label className={cn("flex items-center gap-2 text-sm", !billing && "opacity-60")}>
              <input type="checkbox" checked={boleta} disabled={!billing} onChange={(e) => setBoleta(e.target.checked)} />
              Emitir boleta por {mode === "abono" ? "el abono" : "la recarga"}
              {!billing && <span className="text-xs text-muted">(conecta la facturación en Ajustes)</span>}
            </label>
            {err && (
              <p role="alert" className="text-warning text-sm">
                {err}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={recargar.isPending}>
                {mode === "abono" ? "Registrar abono" : `Recargar ${value > 0 ? formatMoney(value) : ""}`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

/** Alta o edición de un comensal (con su familia). */
export function ComensalModal({ comensal, onClose }: { comensal: Comensal | null; onClose: () => void }) {
  const { data: settings } = useSettings();
  const { data: categories = [] } = useCategories();
  const { data: responsables = [] } = useResponsables();
  const { saveComensal, saveResponsable } = useComedorActions();
  const branchId = useBranchStore((s) => s.branchId);
  const [f, setF] = useState<ComensalInput>(
    comensal ?? {
      code: "",
      name: "",
      tipo: "alumno",
      grupo: "",
      plan: "prepago",
      abonoHasta: null,
      dailyLimit: settings?.defaultDailyLimit ?? null,
      blockedCategoryIds: [],
      allergies: "",
      responsableId: null,
      active: true,
      branchId,
    },
  );
  const [limit, setLimit] = useState(f.dailyLimit == null ? "" : String(f.dailyLimit));
  const [newResp, setNewResp] = useState({ name: "", phone: "", email: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ComensalInput>(k: K, v: ComensalInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const empresa = settings?.comedorMode === "empresa";

  async function save() {
    setErr(null);
    const l = limit.trim() ? Number(limit.replace(",", ".")) : null;
    if (l !== null && (Number.isNaN(l) || l < 0)) return setErr("El tope diario debe ser un monto (ej. 10).");
    try {
      let responsableId = f.responsableId;
      if (responsableId === "__new") {
        if (!newResp.name.trim()) return setErr("Escribe el nombre del responsable.");
        responsableId = await saveResponsable.mutateAsync({ ...newResp, phone: newResp.phone.replace(/\D/g, "") });
      }
      await saveComensal.mutateAsync({ ...f, dailyLimit: l, responsableId });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="comensal-title">
      <form
        className="p-5 space-y-3 max-h-[85vh] overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="comensal-title" className="text-lg font-bold">
          {comensal ? "Editar comensal" : "Nuevo comensal"}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="block col-span-1">
            <span className="text-xs text-muted">Código o DNI</span>
            <input autoFocus value={f.code} onChange={(e) => set("code", e.target.value)} className={`${field} font-mono`} />
          </label>
          <label className="block col-span-2">
            <span className="text-xs text-muted">Nombre completo</span>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted">Tipo</span>
            <select value={f.tipo} onChange={(e) => set("tipo", e.target.value as ComensalTipo)} className={field}>
              {(Object.keys(TIPO_LABEL) as ComensalTipo[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">{empresa ? "Área" : "Grado y sección"}</span>
            <input value={f.grupo} onChange={(e) => set("grupo", e.target.value)} placeholder={empresa ? "Ej. Logística" : "Ej. 3.° B primaria"} className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted">Cómo paga el menú</span>
            <select value={f.plan} onChange={(e) => set("plan", e.target.value as ComedorPlan)} className={field}>
              {(Object.keys(PLAN_LABEL) as ComedorPlan[]).map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Tope diario de kiosko (S/)</span>
            <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Sin tope" className={`${field} font-mono`} />
          </label>
        </div>
        {f.plan === "convenio" && <p className="text-xs text-muted">Convenio: el menú lo paga el colegio o la empresa; sale en la liquidación de Reportes.</p>}
        <label className="block">
          <span className="text-xs text-muted">Alergias o restricciones (las ve quien despacha)</span>
          <input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Ej. maní, lactosa" className={field} />
        </label>
        {categories.length > 0 && (
          <fieldset>
            <legend className="text-xs text-muted">No puede comprar en el kiosko</legend>
            <div className="flex flex-wrap gap-2 mt-1">
              {categories.map((c) => {
                const on = f.blockedCategoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("blockedCategoryIds", on ? f.blockedCategoryIds.filter((x) => x !== c.id) : [...f.blockedCategoryIds, c.id])}
                    className={cn("rounded-md px-2.5 py-1 text-sm border", on ? "bg-warning/15 border-warning text-warning" : "bg-chip-bg border-border")}
                  >
                    {c.icon} {c.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {f.tipo === "alumno" && (
          <label className="block">
            <span className="text-xs text-muted">Padre, madre o apoderado</span>
            <select value={f.responsableId ?? ""} onChange={(e) => set("responsableId", e.target.value || null)} className={field}>
              <option value="">Sin responsable</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.phone && `· ${r.phone}`}
                </option>
              ))}
              <option value="__new">+ Nuevo responsable…</option>
            </select>
          </label>
        )}
        {f.responsableId === "__new" && (
          <div className="grid grid-cols-3 gap-2">
            <input value={newResp.name} onChange={(e) => setNewResp({ ...newResp, name: e.target.value })} placeholder="Nombre" className={field} aria-label="Nombre del responsable" />
            <input value={newResp.phone} onChange={(e) => setNewResp({ ...newResp, phone: e.target.value })} placeholder="Celular" inputMode="tel" className={field} aria-label="Celular del responsable" />
            <input value={newResp.email} onChange={(e) => setNewResp({ ...newResp, email: e.target.value })} placeholder="Correo" className={field} aria-label="Correo del responsable" />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
          Activo (cuenta para el plan)
        </label>
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saveComensal.isPending}>
            {comensal ? "Guardar" : "Crear comensal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const KIND_LABEL = { recarga: "Recarga", consumo: "Consumo", ajuste: "Ajuste", abono: "Abono" } as const;

/** Historial del monedero y ajuste de saldo (gerencia). */
export function MovimientosModal({ comensal, onClose }: { comensal: Comensal; onClose: () => void }) {
  const { session } = useAuth();
  const { data: movs = [], isLoading } = useMovimientos(comensal.id);
  const { ajustar } = useComedorActions();
  const manager = session?.role === "dueno" || session?.role === "admin";
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const balance = useMemo(() => movs[0]?.balanceAfter ?? comensal.balance, [movs, comensal.balance]);

  async function doAjuste() {
    setErr(null);
    const v = Number(amount.replace(",", "."));
    if (!v) return setErr("Escribe el monto (negativo para devolver).");
    try {
      await ajustar.mutateAsync({ comensalId: comensal.id, amount: round2(v), reason, actor: session?.staff?.name ?? "Gerencia" });
      setAmount("");
      setReason("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="movs-title">
      <div className="p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="movs-title" className="text-lg font-bold">
            Monedero de {comensal.name}
          </h2>
          <span className="font-mono font-bold">{formatMoney(balance)}</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-border text-sm">
          {isLoading && <li className="py-2 text-muted">Cargando…</li>}
          {!isLoading && movs.length === 0 && <li className="py-2 text-muted">Sin movimientos todavía.</li>}
          {movs.map((m) => (
            <li key={m.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {KIND_LABEL[m.kind]} <span className="text-muted font-normal">· {m.detail}</span>
                </p>
                <p className="text-xs text-muted">
                  {new Date(m.at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}
                  {m.method && m.method !== "saldo" ? ` · ${m.method}` : ""} · {m.actor}
                </p>
              </div>
              <div className="text-right shrink-0 font-mono">
                <p className={m.kind === "consumo" ? "" : "text-success"}>
                  {m.kind === "abono" ? formatMoney(m.amount) : `${m.amount > 0 ? "+" : ""}${formatMoney(m.amount)}`}
                </p>
                <p className="text-xs text-muted">{formatMoney(m.balanceAfter)}</p>
              </div>
            </li>
          ))}
        </ul>
        {manager && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-sm font-semibold">Ajuste de saldo</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,-]/g, ""))} placeholder="-5.00" inputMode="decimal" className={`${field} font-mono`} aria-label="Monto del ajuste" />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (ej. devolución)" className={`${field} col-span-2`} aria-label="Motivo del ajuste" />
            </div>
            {err && (
              <p role="alert" className="text-warning text-sm">
                {err}
              </p>
            )}
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={doAjuste} disabled={ajustar.isPending}>
                Registrar ajuste
              </Button>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
