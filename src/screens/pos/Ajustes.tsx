import { useState } from "react";
import { useSettings, useTenantActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/money";
import type { BusinessSettings, CardProvider } from "@/data/model";

const CURRENCIES: Currency[] = ["PEN", "USD", "EUR"];
const CARD_PROVIDERS: CardProvider[] = ["ninguno", "culqi", "izipay", "niubiz"];

export function Ajustes() {
  const { data: settings } = useSettings();
  const { updateSettings } = useTenantActions();
  if (!settings) return null;

  return (
    <div className="p-6 max-w-2xl">
      <ScreenHeader title="Ajustes del negocio" subtitle="Moneda, impuestos y preferencias" />
      <div className="space-y-4">
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

        <PaymentsCard settings={settings} />
      </div>
    </div>
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
