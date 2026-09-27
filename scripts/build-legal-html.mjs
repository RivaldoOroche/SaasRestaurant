// Genera las páginas legales estáticas de la landing (landing/*.html) desde
// la misma fuente que usa la app (src/legal/documents.ts). Así el texto que el
// cliente acepta en la app y el que lee en la web son idénticos.
//   npm run legal:build
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const PAGES = { terminos: "terminos.html", privacidad: "privacidad.html", encargo: "encargo.html", cookies: "cookies.html", comensales: "comensales.html" };
const LABELS = { terminos: "Términos", privacidad: "Privacidad", encargo: "Encargo de datos", cookies: "Cookies", comensales: "Comensales" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function loadDocs() {
  const dir = mkdtempSync(join(tmpdir(), "legal-"));
  const out = join(dir, "docs.mjs");
  await build({ entryPoints: [join(ROOT, "src/legal/documents.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  const mod = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

export function render(doc, entity) {
  const nav = Object.entries(PAGES)
    .map(([id, file]) => `<a href="/${file}"${id === doc.id ? ' aria-current="page" style="font-weight:700"' : ""}>${LABELS[id]}</a>`)
    .join("");
  const toc = doc.sections.map((s, i) => `<li><a href="#s${i}">${esc(s.h)}</a></li>`).join("");
  const body = doc.sections
    .map((s, i) => `    <h2 id="s${i}">${esc(s.h)}</h2>\n${s.p.map((p) => `    <p>${esc(p)}</p>`).join("\n")}`)
    .join("\n\n");
  const extra =
    doc.id === "cookies"
      ? `\n    <p><button type="button" id="openPrefs" style="background:none;border:0;color:#5a4fb0;text-decoration:underline;cursor:pointer;font:inherit">Cambiar mis preferencias de cookies</button></p>`
      : "";
  const script =
    doc.id === "cookies"
      ? `\n    document.getElementById('openPrefs').addEventListener('click',function(){try{localStorage.removeItem('wayra-consent');}catch(e){}location.href='/';});`
      : "";
  return `<!doctype html>
<!-- ARCHIVO GENERADO por scripts/build-legal-html.mjs desde src/legal/documents.ts. No editar a mano. -->
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(doc.title)} — ${esc(entity.nombreComercial)}</title>
  <meta name="description" content="${esc(doc.summary)}" />
  <link rel="canonical" href="https://www.${entity.sitio}/${PAGES[doc.id]}" />
  <meta name="robots" content="index, follow" />
  <link rel="icon" type="image/svg+xml" href="/img/wayra-mark.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <a class="skip" href="#c">Saltar al contenido</a>
  <header><div class="container nav">
    <a class="brand" href="/"><img src="/img/wayra-mark.svg" alt="" width="36" height="36" /><span>Wayra <span class="pos">POS</span></span></a>
    <nav class="nav-links" aria-label="Documentos legales" style="display:flex;position:static;flex-direction:row;flex-wrap:wrap;gap:12px;border:0;padding:0">
      <a href="/">Inicio</a>${nav}
    </nav>
  </div></header>
  <main id="c" class="legal">
    <h1>${esc(doc.title)}</h1>
    <p class="updated">Versión ${esc(doc.version)} · vigente desde el ${esc(doc.updated)}</p>
    <p><strong>En resumen:</strong> ${esc(doc.summary)}</p>
    <ol>${toc}</ol>

${body}${extra}
  </main>
  <footer><div class="container"><div class="legal-bar"><span>© <span id="year">2026</span> ${esc(entity.razonSocial)} · RUC ${esc(entity.ruc)}</span><span><a href="mailto:${entity.emailLegal}">${entity.emailLegal}</a> · <a href="/">Volver al inicio</a></span></div></div></footer>
  <script>
    document.getElementById('year').textContent=new Date().getFullYear();${script}
  </script>
</body>
</html>
`;
}

export async function buildAll() {
  const { LEGAL_DOCS, LEGAL_ENTITY } = await loadDocs();
  const out = {};
  for (const [id, file] of Object.entries(PAGES)) out[file] = render(LEGAL_DOCS[id], LEGAL_ENTITY);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = await buildAll();
  for (const [file, html] of Object.entries(files)) writeFileSync(join(ROOT, "landing", file), html);
  // El sitemap debe listar todas las páginas legales.
  const sm = join(ROOT, "landing/sitemap.xml");
  let xml = readFileSync(sm, "utf8");
  for (const file of Object.keys(files)) {
    if (!xml.includes(`/${file}<`)) xml = xml.replace("</urlset>", `  <url><loc>https://www.wayrapos.pe/${file}</loc></url>\n</urlset>`);
  }
  writeFileSync(sm, xml);
  console.log(`Páginas legales generadas: ${Object.keys(files).join(", ")}`);
}
