import { useState } from "react";
import { useSettings, useTenantActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { generateConfigPdf } from "@/lib/configPdf";
import { ConfigChecklist } from "@/components/ConfigChecklist";
import type { Currency } from "@/lib/money";
import type { BusinessSettings, CardProvider, BillingProvider, SunatMode } from "@/data/model";

const CURRENCIES: Currency[] = ["PEN", "USD", "EUR"];
const CARD_PROVIDERS: CardProvider[] = ["ninguno", "culqi", "izipay", "niubiz"];
const BILLING_PROVIDERS: { key: BillingProvider; label: string }[] = [
  { key: "ninguno", label: "Ninguno" },
  { key: "sunat_directo", label: "SUNAT directo" },
  { key: "nubefact", label: "Nubefact" },
  { key: "bizlinks", label: "Bizlinks" },
  { key: "efact", label: "Efact" },
];

export function Ajustes() {
  const { data: settings } = useSettings();
  const { updateSettings } = useTenantActions();
  if (!settings) return null;

  return (
    <div className="p-6 max-w-2xl">
      <ScreenHeader title="Ajustes del negocio" subtitle="Moneda, impuestos y preferencias" />
      <div className="space-y-4">
        <ConfigChecklist />
        <Card>
          <CardBody className="space-y-4">
            <Field label="Nombre del negocio">
              <input
                value={settings.name}
                onChange={(e) => updateSettings.mutate({ name: e.target.value })}
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Moneda">
              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateSettings.mutate({ currency: c })}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm border",
                      settings.currency === c
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-chip-bg border-border",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`IGV (${settings.taxRate}%)`}>
              <div className="flex items-center gap-2">
                <StepBtn onClick={() => updateSettings.mutate({ taxRate: Math.max(0, settings.taxRate - 1) })}>−</StepBtn>
                <span className="w-12 text-center font-mono">{settings.taxRate}%</span>
                <StepBtn onClick={() => updateSettings.mutate({ taxRate: Math.min(25, settings.taxRate + 1) })}>+</StepBtn>
              </div>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <Toggle
              label="Pedidos en línea"
              on={settings.onlineOrders}
              onChange={(v) => updateSettings.mutate({ onlineOrders: v })}
            />
            <Toggle
              label="Propina sugerida en el cobro"
              on={settings.autoTip}
              onChange={(v) => updateSettings.mutate({ autoTip: v })}
            />
          </CardBody>
        </Card>

        <EmisorCard settings={settings} />
        <FacturacionCard settings={settings} />
        <PaymentsCard settings={settings} />
      </div>
    </div>
  );
}

function EmisorCard({ settings }: { settings: BusinessSettings }) {
  const { updateSettings } = useTenantActions();
  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="font-semibold">Datos del emisor</h3>
          <p className="text-muted text-xs">Se usan en los comprobantes electrónicos y en el PDF de configuración.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="RUC (11 dígitos)">
            <input
              defaultValue={settings.ruc ?? ""}
              onBlur={(e) => updateSettings.mutate({ ruc: e.target.value })}
              placeholder="20xxxxxxxxx"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="Ubigeo">
            <input
              defaultValue={settings.ubigeo ?? ""}
              onBlur={(e) => updateSettings.mutate({ ubigeo: e.target.value })}
              placeholder="150122"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
            />
          </Field>
        </div>
        <Field label="Razón social">
          <input
            defaultValue={settings.razonSocial ?? ""}
            onBlur={(e) => updateSettings.mutate({ razonSocial: e.target.value })}
            placeholder="MI EMPRESA S.A.C."
            className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Dirección fiscal">
          <input
            defaultValue={settings.direccionFiscal ?? ""}
            onBlur={(e) => updateSettings.mutate({ direccionFiscal: e.target.value })}
            placeholder="Av. Principal 123, Distrito, Provincia"
            className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          />
        </Field>
      </CardBody>
    </Card>
  );
}

function FacturacionCard({ settings }: { settings: BusinessSettings }) {
  const { updateSettings, setFiscalCredentials } = useTenantActions();
  const provider = settings.billingProvider ?? "ninguno";
  const mode: SunatMode = settings.sunatMode ?? "beta";

  // Credenciales secretas (write-only): estado local, no se leen del servidor.
  const [solPass, setSolPass] = useState("");
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  async function descargarPdf() {
    setPdfBusy(true);
    try {
      await generateConfigPdf(settings);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Facturación electrónica</h3>
            <p className="text-muted text-xs">Elige cómo se envían los comprobantes a SUNAT.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={descargarPdf} disabled={pdfBusy}>
            {pdfBusy ? "Generando…" : "📄 PDF de configuración"}
          </Button>
        </div>

        <Field label="Proveedor de facturación">
          <div className="flex flex-wrap gap-2">
            {BILLING_PROVIDERS.map((p) => (
              <button
                key={p.key}
                onClick={() => updateSettings.mutate({ billingProvider: p.key })}
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

        {provider !== "ninguno" && (
          <Field label="Ambiente SUNAT">
            <div className="flex gap-2">
              {(["beta", "produccion"] as SunatMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => updateSettings.mutate({ sunatMode: m })}
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
        )}

        {/* SUNAT directo: usuario/clave SOL + certificado + llave */}
        {provider === "sunat_directo" && (
          <div className="space-y-3">
            <Field label="Usuario SOL">
              <input
                defaultValue={settings.solUser ?? ""}
                onBlur={(e) => updateSettings.mutate({ solUser: e.target.value })}
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
                disabled={setFiscalCredentials.isPending || (!solPass && !certPem && !keyPem)}
                onClick={() => {
                  setFiscalCredentials.mutate({
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
        )}

        {/* OSE/PSE: endpoint + token */}
        {provider !== "ninguno" && provider !== "sunat_directo" && (
          <div className="space-y-3">
            <Field label="Endpoint del proveedor">
              <input
                defaultValue={settings.billingEndpoint ?? ""}
                onBlur={(e) => updateSettings.mutate({ billingEndpoint: e.target.value })}
                placeholder="https://api.proveedor.com/..."
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
                  disabled={!apiToken || setFiscalCredentials.isPending}
                  onClick={() => {
                    setFiscalCredentials.mutate({ provider, apiToken });
                    setApiToken("");
                  }}
                >
                  Guardar
                </Button>
              </div>
            </Field>
          </div>
        )}

        {provider !== "ninguno" && (
          <p className="text-muted text-xs">
            Las credenciales secretas se guardan cifradas del lado del servidor y nunca se devuelven al navegador.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function PaymentsCard({ settings }: { settings: BusinessSettings }) {
  const { updateSettings, setCardCredentials } = useTenantActions();
  const [secret, setSecret] = useState("");
  const provider = settings.cardProvider ?? "ninguno";

  return (
    <Card>
      <CardBody className="space-y-4">
        <h3 className="font-semibold">Pagos</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Número Yape">
            <input
              defaultValue={settings.yapeNumber ?? ""}
              onBlur={(e) => updateSettings.mutate({ yapeNumber: e.target.value })}
              placeholder="9xx xxx xxx"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Número Plin">
            <input
              defaultValue={settings.plinNumber ?? ""}
              onBlur={(e) => updateSettings.mutate({ plinNumber: e.target.value })}
              placeholder="9xx xxx xxx"
              className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field label="Proveedor de tarjeta">
          <div className="flex flex-wrap gap-2">
            {CARD_PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => updateSettings.mutate({ cardProvider: p })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm border capitalize",
                  provider === p ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {provider !== "ninguno" && (
          <div className="grid grid-cols-1 gap-3">
            <Field label="Llave pública (publicable)">
              <input
                defaultValue={settings.cardPublicKey ?? ""}
                onBlur={(e) => updateSettings.mutate({ cardPublicKey: e.target.value })}
                placeholder="pk_test_..."
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Llave secreta (no se muestra luego)">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="sk_test_..."
                  className="flex-1 rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!secret || setCardCredentials.isPending}
                  onClick={() => {
                    setCardCredentials.mutate({ provider, secretKey: secret });
                    setSecret("");
                  }}
                >
                  Guardar
                </Button>
              </div>
            </Field>
            <p className="text-muted text-xs">
              La llave secreta se guarda cifrada del lado del servidor y nunca se devuelve al navegador.
            </p>
          </div>
        )}
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

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-9 w-9 rounded-md bg-chip-bg border border-border">
      {children}
    </button>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!on)}
        className={cn("h-6 w-11 rounded-full transition-colors relative", on ? "bg-accent" : "bg-chip-bg border border-border")}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
            on ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
