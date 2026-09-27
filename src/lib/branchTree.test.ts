import { describe, it, expect } from "vitest";
import { buildTree, descendants, flatten, indentedName } from "./branchTree";

const B = [
  { id: "s2", name: "Surco", city: "Lima", parentId: "root" },
  { id: "root", name: "Miraflores", city: "Lima", parentId: null },
  { id: "s1", name: "Barranco", city: "Lima", parentId: "root" },
  { id: "s11", name: "Barranco Express", city: "Lima", parentId: "s1" },
];

describe("árbol de sucursales", () => {
  it("la sede principal es la raíz y las hijas quedan ordenadas por nombre", () => {
    const flat = flatten(buildTree(B));
    expect(flat.map((n) => [n.name, n.depth])).toEqual([
      ["Miraflores", 0],
      ["Barranco", 1],
      ["Barranco Express", 2],
      ["Surco", 1],
    ]);
    expect(flat.map(indentedName)).toEqual(["Miraflores", "└ Barranco", "  └ Barranco Express", "└ Surco"]);
  });

  it("descendientes: evita mover una rama debajo de sí misma", () => {
    expect([...descendants(B, "root")].sort()).toEqual(["s1", "s11", "s2"]);
    expect([...descendants(B, "s1")]).toEqual(["s11"]);
    expect(descendants(B, "s2").size).toBe(0);
  });
});
