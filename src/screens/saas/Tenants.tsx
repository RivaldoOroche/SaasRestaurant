import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenants, usePlatformActions } from "@/data/platform/hooks";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { homePathForRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import type { Tenant, PlanTier, SaasCharge } from "@/data/platform/model";

const PLAN_TONE: Record<PlanTier, "neutral" | "accent" | "success"> = {
  Básico: "neutral",
  Pro: "accent",
  Enterprise: "success",
};

export function Tenants() {
  const { data: tenants = [] } = useTenants();
  const [detail, setDetail] = useState<Tenant | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const totalMrr = tenants.reduce((s, t) => s + t.mrr, 0);

  return (
    <div className="p-6 max-w-6xl">
      <ScreenHeader
        title="Tenants (clientes)"
        subtitle="Restaurantes que usan tu plataforma"
        actions={
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted">MRR total</p>
              <p className="font-mono font-bold">{formatMoney(totalMrr)}</p>
            </div>
            <Button onClick={() => setNewOpen(true)}>+ Nuevo cliente</Button>
          </div>
        }
      />

      <Card className="divide-y divide-border-soft">
        {tenants.map((t) => (
          <div key={t.id} className={cn("flex items-center gap-4 p-4", t.isYou && "bg-accent/5")}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{t.name}</p>
                {t.isYou && <Badge tone="accent">Tu demo</Badge>}
              </div>
              <p className="text-muted text-xs">
                {t.ownerName} · cliente desde {t.since}
              </p>
            </div>
            <Badge tone={PLAN_TONE[t.plan]}>{t.plan}</Badge>
            <span className="text-muted text-xs w-28 text-right hidden md:block">
              {t.branches} suc · {t.users} usr
            </span>
            <Badge tone={t.status === "Activo" ? "success" : t.status === "Prueba" ? "warning" : "neutral"}>
              {t.status}
            </Badge>
            <Button size="sm" variant="secondary" onClick={() => setDetail(t)}>
              Gestionar
            </Button>
          </div>
        ))}
      </Card>

      {detail && <TenantDetail tenant={detail} onClose={() => setDetail(null)} />}
      <NewTenantModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function TenantDetail({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const { setPlan, toggleSuspend, charge } = usePlatformActions();
  const { enterTenant } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<SaasCharge | null>(null);

  function enter() {
    enterTenant(tenant.id, tenant.name);
    navigate(homePathForRole("dueno"));
  }

  return (
    <Modal open onClose={onClose} labelledBy="td-title" className="max-w-md">
      <div className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted">Tenant</p>
        <h2 id="td-title" className="text-2xl font-bold">
          {tenant.name}
        </h2>
        <p className="text-muted text-sm mb-4">
          {tenant.ownerName} · cliente desde {tenant.since}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Tile label="MRR" value={formatMoney(tenant.mrr)} />
          <Tile label="Sucursales" value={String(tenant.branches)} />
          <Tile label="Usuarios" value={String(tenant.users)} />
        </div>

        <p className="text-xs uppercase tracking-wide text-muted mb-2">Cambiar plan</p>
        <div className="flex gap-2 mb-4">
          {(["Básico", "Pro", "Enterprise"] as PlanTier[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlan.mutate({ id: tenant.id, plan: p })}
              className={cn(
                "flex-1 rounded-md px-2 py-2 text-sm border",
                tenant.plan === p ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {tenant.link && (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-muted mb-1">Link de acceso del tenant</p>
            <div className="flex gap-2">
              <input readOnly value={tenant.link} className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono" />
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(tenant.link!)}>
                Copiar
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Button className="w-full" onClick={enter}>
            Entrar como cliente
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={async () => setInvoice(await charge.mutateAsync({ id: tenant.id, method: "tarjeta" }))}
          >
            Cobrar / emitir factura
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => toggleSuspend.mutate(tenant.id)}>
            {tenant.status === "Suspendido" ? "Reactivar" : "Suspender"}
          </Button>
        </div>
      </div>
      {invoice && <SaasInvoiceView charge={invoice} onClose={() => setInvoice(null)} />}
    </Modal>
  );
}

export function SaasInvoiceView({ charge, onClose }: { charge: SaasCharge; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} labelledBy="inv-title" className="max-w-md">
      <div className="p-5">
        <h2 id="inv-title" className="text-lg font-bold mb-3">
          Factura de suscripción
        </h2>
        <div className="print-area rounded-lg border border-border-soft bg-surface-alt p-4 font-mono text-sm">
          <p className="font-bold">NubePOS S.A.C.</p>
          <p className="text-xs text-muted">RUC 20600000001 · Lima, Perú</p>
          <div className="border-t border-dashed border-border my-2" />
          <p>Cliente: {charge.tenant}</p>
          <p>Responsable: {charge.ownerName}</p>
          <p className="text-muted">Folio {charge.folio} · {charge.date}</p>
          <div className="border-t border-dashed border-border my-2" />
          <div className="flex justify-between">
            <span>Suscripción · Plan {charge.plan}</span>
            <span>{formatMoney(charge.base)}</span>
          </div>
          <div className="flex justify-between">
            <span>IGV (18%)</span>
            <span>{formatMoney(charge.igv)}</span>
          </div>
          <div className="flex justify-between font-bold mt-1">
            <span>TOTAL</span>
            <span>{formatMoney(charge.total)}</span>
          </div>
          <p className="text-xs text-muted mt-2">Pagado con {charge.method} · cobrado ✓</p>
        </div>
        <div className="flex justify-end gap-2 mt-4 no-print">
          <Button variant="secondary" onClick={() => window.print()}>
            🖨 Imprimir
          </Button>
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    </Modal>
  );
}

function NewTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createTenant } = usePlatformActions();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [plan, setPlan] = useState<PlanTier>("Pro");
  const [link, setLink] = useState<string | null>(null);

  function close() {
    setName("");
    setOwner("");
    setPlan("Pro");
    setLink(null);
    onClose();
  }

  async function create() {
    const res = await createTenant.mutateAsync({ name, ownerName: owner, plan });
    setLink(res.link);
  }

  return (
    <Modal open={open} onClose={close} labelledBy="nt-title" className="max-w-md">
      <div className="p-5">
        <h2 id="nt-title" className="text-xl font-bold mb-4">
          Nuevo cliente (tenant)
        </h2>
        {!link ? (
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del restaurante"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Dueño / responsable"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              {(["Básico", "Pro", "Enterprise"] as PlanTier[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-2 text-sm border",
                    plan === p ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-muted text-xs">Se crea con 14 días de prueba.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button onClick={create} disabled={!name || !owner || createTenant.isPending}>
                Crear cliente
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-success/10 text-success px-3 py-2 text-sm">
              Cliente creado ✓ — comparte su link único de acceso:
            </div>
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono" />
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>
                Copiar
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={close}>Listo</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-alt border border-border-soft p-2 text-center">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-mono font-semibold text-sm mt-0.5">{value}</p>
    </div>
  );
}
