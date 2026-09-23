import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getPublicTenantInfo, submitComplaint, type ComplaintPayload } from "@/data/complaints";
import { Button } from "@/components/ui/Button";

export function LibroReclamaciones() {
  const { slug = "" } = useParams();
  const { data: info } = useQuery({ queryKey: ["tenantInfo", slug], queryFn: () => getPublicTenantInfo(slug) });
  const [form, setForm] = useState<ComplaintPayload>({
    consumer_name: "",
    consumer_doc_type: "DNI",
    consumer_doc: "",
    consumer_email: "",
    consumer_phone: "",
    item_type: "servicio",
    claim_type: "reclamo",
    detail: "",
    request: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof ComplaintPayload>(k: K, v: ComplaintPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setErr(null);
    if (!form.consumer_name || !form.consumer_doc || !form.detail) {
      setErr("Completa tu nombre, documento y el detalle del reclamo.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitComplaint(slug, form);
      if (res.error) setErr(res.error);
      else setDone(res.correlativo ?? 0);
    } catch (e) {
      setErr((e as Error).message ?? "No se pudo registrar el reclamo");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";

  if (done !== null) {
    return (
      <div className="min-h-screen bg-bg text-ink grid place-items-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl bg-success/20 grid place-items-center text-2xl">✓</div>
          <h1 className="text-2xl font-bold">Reclamo registrado</h1>
          <p className="text-muted">
            Tu Hoja de Reclamación <b>N° {done}</b> fue registrada. El proveedor responderá en un plazo máximo de
            <b> 15 días hábiles</b> al correo o teléfono indicado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5">
          <h1 className="text-2xl font-bold">Libro de Reclamaciones</h1>
          <p className="text-muted text-sm">
            {info ? `${info.razonSocial ?? info.tenantName}${info.ruc ? ` · RUC ${info.ruc}` : ""}` : "Cargando…"}
          </p>
          {info?.address && <p className="text-muted text-xs">{info.address}</p>}
          <p className="text-muted text-xs mt-1">
            Conforme al Código de Protección y Defensa del Consumidor (Ley 29571).
          </p>
        </header>

        <section className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted">1. Identificación del consumidor</p>
            <input className={input} placeholder="Nombre completo" value={form.consumer_name} onChange={(e) => set("consumer_name", e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <select className={input} value={form.consumer_doc_type} onChange={(e) => set("consumer_doc_type", e.target.value)}>
                <option>DNI</option>
                <option>CE</option>
                <option>Pasaporte</option>
                <option>RUC</option>
              </select>
              <input className={`${input} col-span-2`} placeholder="Número de documento" value={form.consumer_doc} onChange={(e) => set("consumer_doc", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={input} placeholder="Correo" value={form.consumer_email} onChange={(e) => set("consumer_email", e.target.value)} />
              <input className={input} placeholder="Teléfono" value={form.consumer_phone} onChange={(e) => set("consumer_phone", e.target.value)} />
            </div>
            <input className={input} placeholder="Dirección" value={form.consumer_address ?? ""} onChange={(e) => set("consumer_address", e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={!!form.is_minor} onChange={(e) => set("is_minor", e.target.checked)} />
              Soy menor de edad (se requiere un apoderado)
            </label>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted">2. Bien contratado</p>
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={form.item_type} onChange={(e) => set("item_type", e.target.value)}>
                <option value="producto">Producto</option>
                <option value="servicio">Servicio</option>
              </select>
              <input
                className={input}
                type="number"
                placeholder="Monto reclamado (S/)"
                value={form.item_amount ?? ""}
                onChange={(e) => set("item_amount", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <input className={input} placeholder="Descripción del producto/servicio" value={form.item_description ?? ""} onChange={(e) => set("item_description", e.target.value)} />
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted">3. Detalle</p>
            <div className="flex gap-2">
              {(["reclamo", "queja"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set("claim_type", t)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm border capitalize ${form.claim_type === t ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted">
              <b>Reclamo</b>: disconformidad con el producto/servicio. <b>Queja</b>: malestar con la atención.
            </p>
            <textarea className={input} rows={4} placeholder="Detalle del reclamo o queja" value={form.detail} onChange={(e) => set("detail", e.target.value)} />
            <textarea className={input} rows={2} placeholder="Pedido del consumidor" value={form.request ?? ""} onChange={(e) => set("request", e.target.value)} />
          </div>

          {err && <p className="text-warning text-sm">{err}</p>}
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Registrando…" : "Registrar reclamo"}
          </Button>
          <p className="text-[11px] text-muted text-center">
            Tus datos se usan solo para atender este reclamo, conforme a la Ley 29733 de Protección de Datos Personales.
          </p>
        </section>
      </div>
    </div>
  );
}
