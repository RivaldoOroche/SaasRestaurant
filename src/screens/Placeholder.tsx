import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";

/** Empty, correctly-gated screen used until each feature is built out. */
export function Placeholder({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle?: string;
  phase: string;
}) {
  return (
    <div className="p-6 mob:p-4 max-w-6xl">
      <ScreenHeader title={title} subtitle={subtitle} />
      <Card>
        <CardBody className="py-16 text-center">
          <div className="text-4xl mb-3">🚧</div>
          <p className="text-ink font-semibold">Pantalla en construcción</p>
          <p className="text-muted text-sm mt-1">
            Se implementa en <strong>{phase}</strong>. El acceso por rol y el diseño ya están
            activos.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
