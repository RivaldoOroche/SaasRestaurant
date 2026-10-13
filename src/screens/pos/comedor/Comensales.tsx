// Padrón del comedor: alumnos, docentes y colaboradores con su monedero.
// Recargas (caja), alta/edición, importación desde Excel y enlaces del portal
// de familias para enviar por WhatsApp.
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useComedorActions, useComensalQuota, useComensales, useResponsables, useSettings } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMoney, round2 } from "@/lib/money";
import { parsePadron, PLAN_LABEL, TIPO_LABEL, type ComedorPlan, type PadronRow } from "@/lib/comedor";
import { comensalLimitLabel, planInfo } from "@/lib/plans";
import { cn } from "@/lib/cn";
import type { Comensal, Responsable } from "@/data/model";
import { ComensalModal, MovimientosModal, PlanBadge, RecargaModal, field, saldoTone } from "./shared";

type Filtro = "todos" | "saldo_bajo" | ComedorPlan | "inactivos";

export function Comensales() {
  const { session } = useAuth();
  const manager = session?.role === "dueno" || session?.role === "admin";
  const { data: comensales = [], isLoading } = useComensales();
  const { data: settings } = useSettings();
  const { data: quota } = useComensalQuota();
  const minimo = settings?.saldoMinimo ?? 10;
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [edit, setEdit] = useState<Comensal | "new" | null>(null);
  const [recarga, setRecarga] = useState<Comensal | null>(null);
  const [movs, setMovs] = useState<Comensal | null>(null);
  const [importar, setImportar] = useState(false);
  const [familias, setFamilias] = useState(false);

  const activos = comensales.filter((c) => c.active);
  const enMonederos = round2(activos.reduce((s, c) => s + c.balance, 0));
  const bajos = activos.filter((c) => c.plan !== "convenio" && c.balance < minimo).length;

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return comensales
      .filter((c) => (filtro === "inactivos" ? !c.active : c.active))
      .filter((c) =>
        filtro === "saldo_bajo" ? c.plan !== "convenio" && c.balance < minimo : filtro === "todos" || filtro === "inactivos" ? true : c.plan === filtro,
      )
      .filter((c) => !t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t) || c.grupo.toLowerCase().includes(t))
      .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.name.localeCompare(b.name));
  }, [comensales, q, filtro, minimo]);

  const plan = quota ? planInfo(quota.plan) : null;

  return (
    <div className="p-6 mob:p-4 max-w-6xl">
      <ScreenHeader
        title="Comensales"
        subtitle="Padrón, monedero y familias"
        actions={
          manager && (
            <>
              <Button variant="secondary" onClick={() => setFamilias(true)}>
                👪 Enlaces de familias
              </Button>
              <Button variant="secondary" onClick={() => setImportar(true)}>
                Importar padrón
              </Button>
              <Button onClick={() => setEdit("new")}>+ Comensal</Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Activos" value={String(activos.length)} sub={plan ? comensalLimitLabel(plan) : undefined} />
        <Kpi label="Saldo en monederos" value={formatMoney(enMonederos)} sub="dinero adelantado por las familias" />
        <Kpi label="Saldo bajo" value={String(bajos)} sub={`menos de ${formatMoney(minimo)}`} warn={bajos > 0} onClick={() => setFiltro("saldo_bajo")} />
        <Kpi label="Con abono o convenio" value={String(activos.filter((c) => c.plan !== "prepago").length)} sub="menú sin cobrar del saldo" />
      </div>

      {quota && quota.max != null && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>
              Plan {quota.plan}: {quota.used} de {quota.max} comensales activos
            </span>
            {quota.used >= quota.max * 0.9 && <span className="text-warning">Casi al límite: revisa Plan</span>}
          </div>
          <div className="h-1.5 rounded-full bg-chip-bg overflow-hidden" aria-hidden="true">
            <div className={cn("h-full rounded-full", quota.used >= quota.max ? "bg-warning" : "bg-accent")} style={{ width: `${Math.min(100, (quota.used / quota.max) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código o grado…" className={cn(field, "flex-1 min-w-[14rem]")} aria-label="Buscar comensal" />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className={cn(field, "w-auto")} aria-label="Filtrar">
          <option value="todos">Todos los activos</option>
          <option value="saldo_bajo">Saldo bajo</option>
          {(Object.keys(PLAN_LABEL) as ComedorPlan[]).map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
          <option value="inactivos">Inactivos</option>
        </select>
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <p className="p-4 text-muted text-sm">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-muted text-sm">
              {comensales.length === 0 ? "Aún no hay comensales. Importa el padrón desde Excel o agrégalos uno por uno." : "Nadie coincide con la búsqueda."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <button className="flex-1 min-w-[12rem] text-left" onClick={() => (manager ? setEdit(c) : setMovs(c))}>
                    <span className="block font-medium">
                      {c.name} {c.allergies && <span title={`Alergias: ${c.allergies}`}>⚠️</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {c.code} · {c.grupo || TIPO_LABEL[c.tipo]}
                      {c.dailyLimit != null && ` · tope ${formatMoney(c.dailyLimit)}/día`}
                    </span>
                  </button>
                  <PlanBadge c={c} />
                  <span className={cn("font-mono w-24 text-right", saldoTone(c.balance, c.plan === "convenio" ? 0 : minimo))}>{formatMoney(c.balance)}</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setMovs(c)}>
                      Movimientos
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRecarga(c)} disabled={!c.active}>
                      Recargar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {edit && <ComensalModal comensal={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {recarga && <RecargaModal comensal={recarga} onClose={() => setRecarga(null)} />}
      {movs && <MovimientosModal comensal={movs} onClose={() => setMovs(null)} />}
      {importar && <ImportarModal onClose={() => setImportar(false)} />}
      {familias && <FamiliasModal onClose={() => setFamilias(false)} />}
    </div>
  );
}

function Kpi({ label, value, sub, warn, onClick }: { label: string; value: string; sub?: string; warn?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cn("text-left", onClick && "hover:opacity-90")}>
      <Card className="h-full">
        <CardBody>
          <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
          <p className={cn("text-2xl font-bold font-mono mt-1", warn && "text-warning")}>{value}</p>
          {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        </CardBody>
      </Card>
    </Tag>
  );
}

const EJEMPLO = "Código\tNombre\tGrado\tTipo\tPlan\tAlergias\tResponsable\tCelular\tCorreo\nA-0201\tAna Pérez Ríos\t2.° A primaria\tAlumno\tPrepago\tManí\tLuis Pérez\t987654321\tluis@correo.pe";

/** Importa el padrón pegado desde Excel (o CSV). */
function ImportarModal({ onClose }: { onClose: () => void }) {
  const { importPadron } = useComedorActions();
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const parsed = useMemo<{ rows: PadronRow[]; errors: string[] }>(() => (text.trim() ? parsePadron(text) : { rows: [], errors: [] }), [text]);

  async function run() {
    setErr(null);
    try {
      const r = await importPadron.mutateAsync(parsed.rows);
      setResult(`Listo: ${r.created} nuevos y ${r.updated} actualizados.`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="imp-title">
      <div className="p-5 space-y-3">
        <h2 id="imp-title" className="text-lg font-bold">
          Importar padrón
        </h2>
        <p className="text-sm text-muted">
          Copia las filas desde Excel y pégalas aquí. Columnas: código, nombre, grado o área, tipo, plan, alergias, responsable, celular y correo. Solo el
          código y el nombre son obligatorios; si el código ya existe, se actualiza.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={EJEMPLO}
          className={cn(field, "font-mono text-xs")}
          aria-label="Padrón pegado desde Excel"
        />
        {parsed.rows.length > 0 && (
          <p className="text-sm">
            {parsed.rows.length} {parsed.rows.length === 1 ? "fila lista" : "filas listas"}
            {parsed.rows.filter((r) => r.guardianName).length > 0 && ` · ${parsed.rows.filter((r) => r.guardianName).length} con responsable`}
          </p>
        )}
        {parsed.errors.length > 0 && (
          <ul role="alert" className="text-warning text-sm list-disc pl-5">
            {parsed.errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {result && (
          <p role="status" className="text-success text-sm">
            {result}
          </p>
        )}
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setText(EJEMPLO)}>
            Ver ejemplo
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {result ? "Cerrar" : "Cancelar"}
            </Button>
            {!result && (
              <Button onClick={run} disabled={!parsed.rows.length || parsed.errors.length > 0 || importPadron.isPending}>
                Importar {parsed.rows.length || ""}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Enlace privado del portal de cada familia, listo para enviar por WhatsApp. */
function FamiliasModal({ onClose }: { onClose: () => void }) {
  const { data: responsables = [] } = useResponsables();
  const { data: comensales = [] } = useComensales();
  const { data: settings } = useSettings();
  const [copied, setCopied] = useState<string | null>(null);
  const hijos = (r: Responsable) => comensales.filter((c) => c.responsableId === r.id && c.active);
  const link = (r: Responsable) => `${window.location.origin}/familia/${r.portalToken}`;
  const wa = (r: Responsable) => {
    const names = hijos(r).map((c) => c.name.split(" ")[0]).join(" y ");
    const text = `Hola ${r.name.split(" ")[0]}, este es tu enlace del ${settings?.name ?? "comedor"} para ver el saldo de ${names}, reservar el menú y poner topes de consumo: ${link(r)}`;
    return `https://wa.me/51${r.phone.replace(/\D/g, "").slice(-9)}?text=${encodeURIComponent(text)}`;
  };

  return (
    <Modal open onClose={onClose} labelledBy="fam-title">
      <div className="p-5 space-y-3">
        <h2 id="fam-title" className="text-lg font-bold">
          Enlaces de familias
        </h2>
        <p className="text-sm text-muted">
          Cada familia tiene un enlace privado (sin contraseña) para ver el saldo y los consumos de sus hijos, reservar el menú y fijar topes. No lo compartas
          con otras personas.
        </p>
        <ul className="divide-y divide-border max-h-[55vh] overflow-y-auto">
          {responsables.length === 0 && <li className="py-2 text-sm text-muted">Aún no hay responsables: agrégalos al crear un alumno o al importar el padrón.</li>}
          {responsables.map((r) => (
            <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  {hijos(r).map((c) => c.name).join(", ") || "Sin alumnos activos"}
                  {r.phone && ` · ${r.phone}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link(r));
                    setCopied(r.id);
                  }}
                >
                  {copied === r.id ? "Copiado" : "Copiar enlace"}
                </Button>
                {r.phone && (
                  <a href={wa(r)} target="_blank" rel="noreferrer" className="inline-flex items-center h-8 px-3 rounded-md text-sm bg-success/15 text-success border border-success/40">
                    WhatsApp
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
