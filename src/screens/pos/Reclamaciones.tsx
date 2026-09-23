import { useState } from "react";
import { useComplaints, useComplaintActions, useSettings } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { sendNotification } from "@/data/notify";
import type { Complaint } from "@/data/model";

export function Reclamaciones() {
  const { data: complaints = [] } = useComplaints();
  const { data: settings } = useSettings();
  const slug = settings?.slug;
  const pendientes = complaints.filter((c) => c.status === "pendiente").length;
  const publicUrl = slug ? `${window.location.origin}/libro/${slug}` : null;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader
        title="Libro de Reclamaciones"
        subtitle="Hojas de reclamación de tus clientes (Indecopi). Responde dentro de 15 días hábiles."
        actions={<Badge tone={pendientes ? "warning" : "success"}>{pendientes} pendientes</Badge>}
      />

      {publicUrl && (
        <Card className="p-4 mb-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-1">Enlace público del Libro de Reclamaciones</p>
          <div className="flex gap-2">
            <input readOnly value={publicUrl} className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono" />
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(publicUrl)}>
              Copiar
            </Button>
          </div>
          <p className="text-[11px] text-muted mt-1">Publícalo con un aviso visible (obligatorio) y en tu carta QR.</p>
        </Card>
      )}

      {complaints.length === 0 ? (
        <Card className="p-6 text-center text-muted text-sm">No hay reclamaciones registradas.</Card>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <ComplaintCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ComplaintCard({ c }: { c: Complaint }) {
  const { respond } = useComplaintActions();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(c.response ?? "");

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">Hoja N° {c.correlativo}</p>
            <Badge tone={c.claimType === "queja" ? "warning" : "accent"}>{c.claimType}</Badge>
            <Badge tone={c.status === "respondido" ? "success" : "warning"}>{c.status}</Badge>
          </div>
          <p className="text-muted text-xs">
            {c.consumerName} · {c.consumerDocType} {c.consumerDoc}
            {c.consumerEmail ? ` · ${c.consumerEmail}` : ""} · {new Date(c.createdAt).toLocaleDateString("es-PE")}
          </p>
        </div>
        {c.itemAmount != null && <span className="font-mono text-sm">{formatMoney(c.itemAmount)}</span>}
      </div>

      <div className="mt-2 text-sm">
        <p className="text-muted text-xs uppercase tracking-wide">Detalle ({c.itemType})</p>
        <p>{c.detail}</p>
        {c.request && (
          <>
            <p className="text-muted text-xs uppercase tracking-wide mt-2">Pedido del consumidor</p>
            <p>{c.request}</p>
          </>
        )}
      </div>

      {c.response && (
        <div className="mt-2 rounded-md bg-success/10 px-3 py-2 text-sm">
          <p className="text-muted text-xs uppercase tracking-wide">Respuesta del proveedor</p>
          <p>{c.response}</p>
        </div>
      )}

      {!open ? (
        <div className="flex justify-end mt-3">
          <Button size="sm" variant={c.status === "respondido" ? "ghost" : "secondary"} onClick={() => setOpen(true)}>
            {c.status === "respondido" ? "Editar respuesta" : "Responder"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Respuesta al consumidor…"
            className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!text.trim() || respond.isPending}
              onClick={() =>
                respond.mutate(
                  { id: c.id, response: text },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      // Notifica al consumidor por correo (best-effort).
                      if (c.consumerEmail) {
                        void sendNotification({
                          to: c.consumerEmail,
                          subject: `Respuesta a tu reclamo N° ${c.correlativo}`,
                          message: `<p>Hola ${c.consumerName},</p><p>Respondimos tu Hoja de Reclamación N° ${c.correlativo}:</p><blockquote>${text}</blockquote>`,
                        });
                      }
                    },
                  },
                )
              }
            >
              Guardar respuesta
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
