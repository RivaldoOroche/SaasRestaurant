import { useParams, Link } from "react-router-dom";
import { LEGAL_DOCS, type LegalDocId } from "@/legal/documents";
import { LEGAL_ENTITY } from "@/legal/entity";
import { cn } from "@/lib/cn";

const ORDER: LegalDocId[] = ["terminos", "privacidad", "encargo", "cookies", "comensales"];
const SHORT: Record<LegalDocId, string> = {
  terminos: "Términos",
  privacidad: "Privacidad",
  encargo: "Encargo de datos",
  cookies: "Cookies",
  comensales: "Aviso a comensales",
};

/** Centro legal: documentos versionados, legibles en celular e imprimibles. */
export function Legal() {
  const { doc = "terminos" } = useParams();
  const page = LEGAL_DOCS[(doc in LEGAL_DOCS ? doc : "terminos") as LegalDocId];
  const updated = new Date(`${page.updated}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-bg text-ink">
      <nav aria-label="Documentos legales" className="border-b border-border bg-surface-alt no-print overflow-x-auto">
        <div className="mx-auto max-w-3xl px-4 flex gap-1 py-2">
          {ORDER.map((id) => (
            <Link
              key={id}
              to={`/legal/${id}`}
              aria-current={id === page.id ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
                id === page.id ? "bg-accent/20 text-accent font-semibold" : "text-muted hover:text-ink",
              )}
            >
              {SHORT[id]}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6 print-area">
        <h1 className="text-2xl font-bold">{page.title}</h1>
        <p className="text-muted text-xs mt-1">
          Versión {page.version} · vigente desde el {updated} · {LEGAL_ENTITY.razonSocial}
        </p>
        <p className="mt-4 rounded-md bg-accent/10 border border-accent/30 p-3 text-sm">
          <strong>En resumen: </strong>
          {page.summary}
        </p>

        <ol className="mt-5 text-sm text-muted space-y-0.5 no-print" aria-label="Contenido">
          {page.sections.map((s, i) => (
            <li key={s.h}>
              <a href={`#s${i}`} className="hover:text-accent">
                {s.h}
              </a>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-6">
          {page.sections.map((s, i) => (
            <section key={s.h} id={`s${i}`} aria-labelledby={`h${i}`}>
              <h2 id={`h${i}`} className="font-semibold text-lg">
                {s.h}
              </h2>
              {s.p.map((t, j) => (
                <p key={j} className="text-sm leading-relaxed mt-2 text-ink/90">
                  {t}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm no-print">
          <button onClick={() => window.print()} className="rounded-md border border-border bg-chip-bg px-3 py-2 hover:border-accent/60">
            🖨 Imprimir o guardar PDF
          </button>
          <a className="rounded-md border border-border bg-chip-bg px-3 py-2 hover:border-accent/60" href={`mailto:${LEGAL_ENTITY.emailLegal}`}>
            ✉ Consultas: {LEGAL_ENTITY.emailLegal}
          </a>
        </div>
      </main>
    </div>
  );
}
