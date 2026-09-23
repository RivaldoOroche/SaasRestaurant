import { usePlatformSettings, usePlatformActions } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";

export function ConfigSaaS() {
  const { data: s } = usePlatformSettings();
  const { updatePlatformSettings } = usePlatformActions();
  if (!s) return null;

  return (
    <div className="p-6 max-w-2xl">
      <ScreenHeader
        title="Configuración del SaaS"
        subtitle="Datos de tu empresa para facturar la suscripción a los tenants"
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
          <p className="text-muted text-xs">
            Estos datos aparecen en las facturas de suscripción que emites a los restaurantes (tenants).
            La llave de tu pasarela para cobrar suscripciones se configura como secret del servidor.
          </p>
        </CardBody>
      </Card>
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
