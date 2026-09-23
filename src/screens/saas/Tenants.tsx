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
import { tokenizeCard } from "@/lib/cardToken";
import { isBackendConfigured } from "@/lib/supabase";
import type { Tenant, PlanTier, SaasCharge } from "@/data/platform/model";

// Llave pública de la pasarela de la plataforma (para tokenizar la tarjeta del tenant).
const PLATFORM_PK = import.meta.env.VITE_PLATFORM_CARD_PK as string | undefined;
const PLATFORM_CARD = isBackendConfigured && !!PLATFORM_PK;

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
  const { setPlan, toggleSuspend, charge, regenerateLink } = usePlatformActions();
  const { enterTenant } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<SaasCharge | null>(null);
  const [cobrar, setCobrar] = useState(false);
  const [link, setLink] = useState<string | null>(tenant.link);

  async function regenerate() {
    const res = await regenerateLink.mutateAsync(tenant.id);
    setLink(res.link);
  }

  function enter() {
    enterTenant(tenant.id, tenant.name);
    navigate(homePathForRole("dueno"));
  }

  async function cobrarDirecto() {
    // Demo o pago no-tarjeta: registra la factura sin pasarela.
    setInvoice(await charge.mutateAsync({ id: tenant.id, method: "tarjeta" }));
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

        {link && (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-muted mb-1">Link de invitación del dueño</p>
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono" />
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>
                Copiar
              </Button>
            </div>
            <p className="text-[11px] text-muted mt-1">De un solo uso · caduca en 14 días. Al regenerarlo, el anterior deja de servir.</p>
          </div>
        )}

        <div className="space-y-2">
          <Button
            className="w-full"
            variant="ghost"
            disabled={regenerateLink.isPending}
            onClick={regenerate}
          >
            {regenerateLink.isPending ? "Generando…" : link ? "Regenerar link de invitación" : "Generar link de invitación"}
          </Button>
          <Button className="w-full" onClick={enter}>
            Entrar como cliente
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            disabled={charge.isPending}
            onClick={() => (PLATFORM_CARD ? setCobrar(true) : cobrarDirecto())}
          >
            Cobrar suscripción / emitir factura
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => toggleSuspend.mutate(tenant.id)}>
            {tenant.status === "Suspendido" ? "Reactivar" : "Suspender"}
          </Button>
        </div>
      </div>
      {cobrar && (
        <SaasCardModal
          onClose={() => setCobrar(false)}
          onCharge={async (token) => {
            const inv = await charge.mutateAsync({ id: tenant.id, method: "tarjeta", token });
            setCobrar(false);
            setInvoice(inv);
          }}
        />
      )}
      {invoice && <SaasInvoiceView charge={invoice} onClose={() => setInvoice(null)} />}
    </Modal>
  );
}

function SaasCardModal({ onClose, onCharge }: { onClose: () => void; onCharge: (token: string) => Promise<void> }) {
  const [card, setCard] = useState({ number: "", expMonth: "", expYear: "", cvv: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setErr(null);
    setBusy(true);
    try {
      const token = await tokenizeCard("culqi", PLATFORM_PK!, card);
      await onCharge(token);
    } catch (e) {
      setErr((e as Error).message ?? "No se pudo procesar la tarjeta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="saas-card-title" className="max-w-sm">
      <div className="p-5 space-y-3">
        <h2 id="saas-card-title" className="text-lg font-bold">Cobrar suscripción con tarjeta</h2>
        <input
          value={card.number}
          onChange={(e) => setCard({ ...card, number: e.target.value })}
          placeholder="Número de tarjeta"
          className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
        />
        <div className="grid grid-cols-3 gap-2">
          <input value={card.expMonth} onChange={(e) => setCard({ ...card, expMonth: e.target.value })} placeholder="MM" className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono" />
          <input value={card.expYear} onChange={(e) => setCard({ ...card, expYear: e.target.value })} placeholder="AAAA" className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono" />
          <input value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} placeholder="CVV" className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono" />
        </div>
        <input
          value={card.email}
          onChange={(e) => setCard({ ...card, email: e.target.value })}
          placeholder="Correo del responsable"
          className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
        />
        {err && <p className="text-warning text-xs">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={pay} disabled={busy}>{busy ? "Procesando…" : "Cobrar"}</Button>
        </div>
      </div>
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
          <p className="font-bold">Wayra POS S.A.C.</p>
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

type NewMode = "link" | "cuenta";

/** Genera una contraseña temporal legible (sin caracteres ambiguos). */
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
  let out = "";
  const rnd = new Uint32Array(10);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < 10; i++) out += chars[rnd[i] % chars.length];
  return out;
}

function NewTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createTenant, createTenantWithOwner } = usePlatformActions();
  const [mode, setMode] = useState<NewMode>("link");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [plan, setPlan] = useState<PlanTier>("Pro");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(tempPassword());
  const [link, setLink] = useState<string | null>(null);
  const [account, setAccount] = useState<{ email: string; password: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function close() {
    setMode("link");
    setName("");
    setOwner("");
    setPlan("Pro");
    setEmail("");
    setPassword(tempPassword());
    setLink(null);
    setAccount(null);
    setErr(null);
    onClose();
  }

  const busy = createTenant.isPending || createTenantWithOwner.isPending;

  async function create() {
    setErr(null);
    try {
      if (mode === "cuenta") {
        if (!email || password.length < 8) {
          setErr("Ingresa un correo y una contraseña de al menos 8 caracteres.");
          return;
        }
        await createTenantWithOwner.mutateAsync({
          input: { name, ownerName: owner, plan },
          credentials: { email, password },
        });
        setAccount({ email, password });
      } else {
        const res = await createTenant.mutateAsync({ name, ownerName: owner, plan });
        setLink(res.link);
      }
    } catch (e) {
      setErr((e as Error).message ?? "No se pudo crear el cliente");
    }
  }

  const done = link || account;

  return (
    <Modal open={open} onClose={close} labelledBy="nt-title" className="max-w-md">
      <div className="p-5">
        <h2 id="nt-title" className="text-xl font-bold mb-4">
          Nuevo cliente (tenant)
        </h2>
        {!done ? (
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

            <div>
              <p className="text-xs uppercase tracking-wide text-muted mb-1">Cómo dar acceso</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("link")}
                  className={cn(
                    "rounded-md px-2 py-2 text-xs border text-left",
                    mode === "link" ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                  )}
                >
                  <span className="block font-semibold">Enviar invitación</span>
                  <span className="block text-[11px] opacity-80">El dueño crea su contraseña</span>
                </button>
                <button
                  onClick={() => setMode("cuenta")}
                  className={cn(
                    "rounded-md px-2 py-2 text-xs border text-left",
                    mode === "cuenta" ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                  )}
                >
                  <span className="block font-semibold">Crear cuenta ahora</span>
                  <span className="block text-[11px] opacity-80">Con contraseña temporal</span>
                </button>
              </div>
            </div>

            {mode === "cuenta" && (
              <div className="space-y-2 rounded-md border border-border-soft p-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Correo del dueño"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña temporal"
                    className="flex-1 rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                  />
                  <Button size="sm" variant="secondary" onClick={() => setPassword(tempPassword())}>
                    Generar
                  </Button>
                </div>
                <p className="text-[11px] text-muted">
                  El dueño entra de inmediato con este correo y contraseña; pídele que la cambie al ingresar.
                </p>
              </div>
            )}

            <p className="text-muted text-xs">Se crea con 14 días de prueba.</p>
            {err && <p className="text-warning text-xs">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button
                onClick={create}
                disabled={!name || !owner || (mode === "cuenta" && !email) || busy}
              >
                {busy ? "Creando…" : mode === "cuenta" ? "Crear cliente y cuenta" : "Crear cliente"}
              </Button>
            </div>
          </div>
        ) : account ? (
          <div className="space-y-3">
            <div className="rounded-md bg-success/10 text-success px-3 py-2 text-sm">
              Cliente y cuenta creados ✓ — comparte estas credenciales con el dueño:
            </div>
            <div className="rounded-md border border-border bg-chip-bg px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted text-xs">Correo:</span>{" "}
                <span className="font-mono">{account.email}</span>
              </p>
              <p>
                <span className="text-muted text-xs">Contraseña:</span>{" "}
                <span className="font-mono">{account.password}</span>
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(`Correo: ${account.email}\nContraseña: ${account.password}`)}
            >
              Copiar credenciales
            </Button>
            <p className="text-[11px] text-muted">
              Por seguridad, indícale que cambie la contraseña al iniciar sesión.
            </p>
            <div className="flex justify-end">
              <Button onClick={close}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-success/10 text-success px-3 py-2 text-sm">
              Cliente creado ✓ — comparte su link único de acceso:
            </div>
            <div className="flex gap-2">
              <input readOnly value={link!} className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono" />
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link!)}>
                Copiar
              </Button>
            </div>
            <p className="text-[11px] text-muted">De un solo uso · caduca en 14 días.</p>
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
