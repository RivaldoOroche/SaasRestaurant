// Pide al dueño aceptar los documentos legales vigentes cuando cambian (o si
// su cuenta la creó la plataforma y aún no los aceptó). Explica qué cambió en
// una línea y enlaza al texto completo; no se puede operar sin aceptar, pero
// sí salir o revisar el plan para cancelar sin penalidad.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useRepo } from "@/data/hooks";
import { pendingAcceptance } from "@/legal/documents";

export function LegalGate() {
  const repo = useRepo();
  const qc = useQueryClient();
  const { data: accepted } = useQuery({ queryKey: ["legalAccepted"], queryFn: () => repo.getLegalAcceptances(), staleTime: Infinity });
  const [check, setCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { pathname } = useLocation();
  // En la pantalla del plan no se bloquea: el dueño debe poder revisarlo o cancelar.
  if (!accepted || pathname === "/pos/plan") return null;
  const pending = pendingAcceptance(accepted);
  if (pending.length === 0) return null;

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      await repo.acceptLegal(pending.map((d) => ({ document: d.id, version: d.version })));
      await qc.invalidateQueries({ queryKey: ["legalAccepted"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const first = Object.keys(accepted).length === 0;
  return (
    <Modal open onClose={() => undefined} labelledBy="legal-gate-title">
      <div className="p-5 space-y-3">
        <h2 id="legal-gate-title" className="text-lg font-bold">
          {first ? "Antes de empezar" : "Actualizamos nuestros documentos"}
        </h2>
        <p className="text-sm text-muted">
          {first
            ? "Revisa y acepta las condiciones del servicio. Son claras y sin letra chica: sin permanencia, tus datos son tuyos y puedes exportarlos cuando quieras."
            : "Revisa los cambios. Si no estás de acuerdo, puedes cancelar tu plan sin penalidad antes de que entren en vigor."}
        </p>
        <ul className="space-y-2">
          {pending.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-3 text-sm">
              <a href={`/legal/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                {d.title}
              </a>{" "}
              <span className="text-muted text-xs">(versión {d.version})</span>
              <p className="text-muted text-xs mt-1">{d.summary}</p>
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={check} onChange={(e) => setCheck(e.target.checked)} />
          <span>Leí y acepto estos documentos en nombre de mi negocio.</span>
        </label>
        {err && <p className="text-warning text-sm">{err}</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <Link to="/pos/plan" className="text-sm text-muted underline self-center">
            Ver mi plan
          </Link>
          <Button onClick={accept} disabled={!check || busy}>
            {busy ? "Guardando…" : "Aceptar y continuar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
