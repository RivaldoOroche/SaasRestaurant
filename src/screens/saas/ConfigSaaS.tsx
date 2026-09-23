import { useState } from "react";
import { usePlatformSettings, usePlatformActions } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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
    <div className="p-6 max-w-2xl space-y-4">
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
    </div>
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
    <div>
      <p className="text-xs uppercase tracking-wide text-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}
