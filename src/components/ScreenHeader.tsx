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
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t}</h1>
        {s && <p className="text-muted text-sm mt-0.5">{s}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
