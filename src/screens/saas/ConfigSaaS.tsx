import { useEffect, useState } from "react";
import { usePlatformSettings, usePlatformActions, useAccessLog, useConfigAudit } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import {
  twoFactorAvailable,
  listTotpFactors,
  enrollTotp,
  verifyEnroll,
  unenrollTotp,
  type EnrollResult,
} from "@/lib/twofa";

const BILLING_PROVIDERS = [
  { key: "sunat_directo", label: "SUNAT directo" },
  { key: "nubefact", label: "Nubefact" },
  { key: "bizlinks", label: "Bizlinks" },
  { key: "efact", label: "Efact" },
];

export function ConfigSaaS() {
  const { data: s } = usePlatformSettings();
  const { updatePlatformSettings } = usePlatformActions();
  if (!s) return null;

  return (
    <div className="p-6 mob:p-4 max-w-2xl space-y-4">
      <ScreenHeader
        title="Configuración del SaaS"
        subtitle="Datos de tu empresa y cómo emites las facturas de suscripción a los tenants"
      />
      <Card>
        <CardBody className="space-y-4">
          <Field label="Razón social">
            <input
              defaultValue={s.razonSocial}
              onBlur={(e) => updatePlatformSettings.mutate({ razonSocial: e.target.value })}
              placeholder="Wayra POS S.A.C."
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RUC">
              <input
                defaultValue={s.ruc}
                onBlur={(e) => updatePlatformSettings.mutate({ ruc: e.target.value })}
                placeholder="20xxxxxxxxx"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Correo de facturación">
              <input
                defaultValue={s.billingEmail}
                onBlur={(e) => updatePlatformSettings.mutate({ billingEmail: e.target.value })}
                placeholder="facturacion@tuempresa.pe"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <Field label="Dirección fiscal">
            <input
              defaultValue={s.direccion}
              onBlur={(e) => updatePlatformSettings.mutate({ direccion: e.target.value })}
              placeholder="Av. Principal 123, Distrito, Lima"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
          </Field>
        </CardBody>
      </Card>

      <FacturacionSaasCard
        provider={s.billingProvider ?? "sunat_directo"}
        mode={s.sunatMode ?? "beta"}
        solUser={s.solUser ?? ""}
        billingEndpoint={s.billingEndpoint ?? ""}
      />

      <TwoFactorCard />
      <AccessLogCard />
      <ConfigAuditCard />
    </div>
  );
}

function TwoFactorCard() {
  const [factors, setFactors] = useState<{ id: string }[]>([]);
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => void listTotpFactors().then(setFactors);
  useEffect(() => {
    if (twoFactorAvailable) refresh();
  }, []);

  async function start() {
    setErr(null);
    setBusy(true);
    const res = await enrollTotp();
    setBusy(false);
    if ("error" in res) setErr(res.error);
    else setEnroll(res);
  }
  async function confirm() {
    if (!enroll) return;
    setErr(null);
    setBusy(true);
    const e = await verifyEnroll(enroll.factorId, code);
    setBusy(false);
    if (e) return setErr(e);
    setEnroll(null);
    setCode("");
    refresh();
  }
  async function disable(id: string) {
    setBusy(true);
    await unenrollTotp(id);
    setBusy(false);
    refresh();
  }

  const active = factors.length > 0;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Autenticación en dos pasos (2FA)</h3>
            <p className="text-muted text-xs">Protege tu cuenta de plataforma con un código temporal (TOTP).</p>
          </div>
          <Badge tone={active ? "success" : "neutral"}>{active ? "Activo" : "Inactivo"}</Badge>
        </div>

        {!twoFactorAvailable ? (
          <p className="text-muted text-xs">Disponible con Supabase configurado (no en modo demo).</p>
        ) : active ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => disable(factors[0].id)}>
            Desactivar 2FA
          </Button>
        ) : enroll ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">Escanea el QR con Google Authenticator / Authy y confirma con el código:</p>
            <div className="bg-white p-2 rounded-md w-40" dangerouslySetInnerHTML={{ __html: enroll.qrSvg }} />
            <p className="text-[11px] text-muted">
              o ingresa la clave manualmente: <span className="font-mono">{enroll.secret}</span>
            </p>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono tracking-widest w-32"
              />
              <Button size="sm" disabled={code.length < 6 || busy} onClick={confirm}>
                Activar
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy} onClick={start}>
            {busy ? "Generando…" : "Activar 2FA"}
          </Button>
        )}
        {err && <p className="text-warning text-xs">{err}</p>}
      </CardBody>
    </Card>
  );
}

function AccessLogCard() {
  const { data: log = [] } = useAccessLog();
  const EVENT_LABEL: Record<string, string> = {
    login: "Inicio de sesión",
    logout: "Cierre de sesión",
    "2fa_enroll": "Activó 2FA",
    "2fa_disable": "Desactivó 2FA",
  };
  return (
    <Card>
      <CardBody>
        <h3 className="font-semibold mb-1">Auditoría de accesos</h3>
        <p className="text-muted text-xs mb-3">Últimos inicios de sesión y cambios de seguridad.</p>
        {log.length === 0 ? (
          <p className="text-muted text-sm">Sin registros aún.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {log.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.email}</p>
                  <p className="text-muted text-xs truncate">
                    {EVENT_LABEL[a.event] ?? a.event} · {a.role} · {a.userAgent}
                  </p>
                </div>
                <span className="text-muted text-xs whitespace-nowrap">
                  {new Date(a.at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ConfigAuditCard() {
  const { data: log = [] } = useConfigAudit();
  return (
    <Card>
      <CardBody>
        <h3 className="font-semibold mb-1">Auditoría de configuración</h3>
        <p className="text-muted text-xs mb-3">
          Cambios sensibles de configuración (datos fiscales, credenciales, permisos). Los secretos se registran
          enmascarados: se guarda qué cambió, nunca el valor.
        </p>
        {log.length === 0 ? (
          <p className="text-muted text-sm">Sin cambios registrados aún.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {log.map((c) => (
              <div key={c.id} className="flex items-start gap-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {c.table} · <span className="text-muted font-normal">{c.op}</span>
                  </p>
                  <p className="text-muted text-xs">
                    {c.tenant} · {c.email}
                    {c.keys.length > 0 && <> · {c.keys.join(", ")}</>}
                  </p>
                </div>
                <span className="text-muted text-xs whitespace-nowrap">
                  {new Date(c.at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FacturacionSaasCard({
  provider,
  mode,
  solUser,
  billingEndpoint,
}: {
  provider: string;
  mode: string;
  solUser: string;
  billingEndpoint: string;
}) {
  const { updatePlatformSettings, setPlatformFiscalCredentials } = usePlatformActions();
  const [solPass, setSolPass] = useState("");
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [apiToken, setApiToken] = useState("");

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="font-semibold">Facturación de la plataforma</h3>
          <p className="text-muted text-xs">Cómo emites las facturas de suscripción a tus tenants (SUNAT directo u OSE).</p>
        </div>

        <Field label="Proveedor de facturación">
          <div className="flex flex-wrap gap-2">
            {BILLING_PROVIDERS.map((p) => (
              <button
                key={p.key}
                onClick={() => updatePlatformSettings.mutate({ billingProvider: p.key })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm border",
                  provider === p.key ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Ambiente SUNAT">
          <div className="flex gap-2">
            {["beta", "produccion"].map((m) => (
              <button
                key={m}
                onClick={() => updatePlatformSettings.mutate({ sunatMode: m })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm border",
                  mode === m ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                )}
              >
                {m === "beta" ? "Homologación (beta)" : "Producción"}
              </button>
            ))}
          </div>
        </Field>

        {provider === "sunat_directo" ? (
          <div className="space-y-3">
            <Field label="Usuario SOL">
              <input
                defaultValue={solUser}
                onBlur={(e) => updatePlatformSettings.mutate({ solUser: e.target.value })}
                placeholder="MODDATOS (beta)"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Clave SOL (secreta)">
              <input
                type="password"
                value={solPass}
                onChange={(e) => setSolPass(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Certificado X.509 (PEM)">
              <textarea
                value={certPem}
                onChange={(e) => setCertPem(e.target.value)}
                rows={3}
                placeholder="-----BEGIN CERTIFICATE-----"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-xs font-mono"
              />
            </Field>
            <Field label="Llave privada PKCS#8 (PEM)">
              <textarea
                value={keyPem}
                onChange={(e) => setKeyPem(e.target.value)}
                rows={3}
                placeholder="-----BEGIN PRIVATE KEY-----"
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-xs font-mono"
              />
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                disabled={setPlatformFiscalCredentials.isPending || (!solPass && !certPem && !keyPem)}
                onClick={() => {
                  setPlatformFiscalCredentials.mutate({
                    provider,
                    solPass: solPass || undefined,
                    certPem: certPem || undefined,
                    keyPem: keyPem || undefined,
                  });
                  setSolPass("");
                  setCertPem("");
                  setKeyPem("");
                }}
              >
                Guardar credenciales SUNAT
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Endpoint del proveedor">
              <input
                defaultValue={billingEndpoint}
                onBlur={(e) => updatePlatformSettings.mutate({ billingEndpoint: e.target.value })}
                placeholder="https://api.nubefact.com/api/v1/..."
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Token / API key (secreto)">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!apiToken || setPlatformFiscalCredentials.isPending}
                  onClick={() => {
                    setPlatformFiscalCredentials.mutate({ provider, apiToken });
                    setApiToken("");
                  }}
                >
                  Guardar
                </Button>
              </div>
            </Field>
          </div>
        )}

        <p className="text-muted text-xs">
          Las credenciales secretas se guardan cifradas del lado del servidor y nunca se devuelven al navegador.
          Al cobrar una suscripción, la factura se emite con este proveedor.
        </p>
      </CardBody>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
