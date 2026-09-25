import type { ReactNode } from "react";
import { useLang, localizeText } from "@/i18n";

export function ScreenHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  // Internacionaliza por texto fuente: cada pantalla pasa su título en español y
  // aquí se traduce al idioma activo, sin tocar las 30+ pantallas.
  const lang = useLang((s) => s.lang);
  const t = localizeText(title, lang) ?? title;
  const s = localizeText(subtitle, lang);
  return (
    // flex-wrap: en pantallas angostas las acciones bajan debajo del título en
    // lugar de apretarlo o salirse por la derecha.
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-6">
      <div className="min-w-0 max-w-full">
        <h1 className="text-2xl font-bold text-ink">{t}</h1>
        {s && <p className="text-muted text-sm mt-0.5">{s}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">{actions}</div>}
    </div>
  );
}
