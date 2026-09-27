import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LEGAL_DOCS, pendingAcceptance, currentVersions } from "./documents";

describe("documentos legales", () => {
  it("cada documento tiene versión, resumen y secciones con texto", () => {
    for (const d of Object.values(LEGAL_DOCS)) {
      expect(d.version).toMatch(/^\d{4}-\d{2}/);
      expect(d.summary.length).toBeGreaterThan(40);
      expect(d.sections.length).toBeGreaterThan(0);
      for (const s of d.sections) expect(s.p.every((p) => p.trim().length > 0)).toBe(true);
    }
  });

  it("pide aceptar solo lo que falta o cambió de versión", () => {
    expect(pendingAcceptance({}).map((d) => d.id)).toEqual(["terminos", "privacidad", "encargo"]);
    expect(pendingAcceptance(currentVersions())).toEqual([]);
    expect(pendingAcceptance({ ...currentVersions(), terminos: "2020-01" }).map((d) => d.id)).toEqual(["terminos"]);
  });

  it("las páginas legales de la landing están al día (npm run legal:build)", async () => {
    // @ts-expect-error módulo .mjs sin tipos
    const { buildAll } = await import("../../scripts/build-legal-html.mjs");
    const files: Record<string, string> = await buildAll();
    for (const [file, html] of Object.entries(files)) expect(readFileSync(`landing/${file}`, "utf8")).toBe(html);
  });
});
