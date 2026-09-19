import { useSettings, useTenantActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/money";

const CURRENCIES: Currency[] = ["PEN", "USD", "EUR"];

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
      </div>
    </div>
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
