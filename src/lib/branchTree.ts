// Utilidades del árbol de sucursales (sede principal = raíz).
import type { Branch } from "@/data/model";

export interface BranchNode extends Branch {
  depth: number;
  children: BranchNode[];
}

/** Arma el árbol; ramas huérfanas (padre inexistente) cuelgan de la raíz. */
export function buildTree(branches: Branch[]): BranchNode[] {
  const nodes = new Map<string, BranchNode>(branches.map((b) => [b.id, { ...b, depth: 0, children: [] }]));
  const roots: BranchNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent && parent.id !== n.id) parent.children.push(n);
    else roots.push(n);
  }
  // La sede principal primero; el resto por nombre.
  const sort = (list: BranchNode[]) => {
    list.sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId) || a.name.localeCompare(b.name, "es"));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  const setDepth = (list: BranchNode[], d: number) =>
    list.forEach((n) => {
      n.depth = d;
      setDepth(n.children, d + 1);
    });
  setDepth(roots, 0);
  return roots;
}

/** Recorrido en orden (para listas y selectores con sangría). */
export function flatten(tree: BranchNode[]): BranchNode[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Ids de todas las sucursales que dependen de `id` (no se puede mover una rama debajo de sí misma). */
export function descendants(branches: Branch[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (pid: string) => {
    for (const b of branches) {
      if (b.parentId === pid && !out.has(b.id)) {
        out.add(b.id);
        walk(b.id);
      }
    }
  };
  walk(id);
  return out;
}

/** Nombre con sangría para <select>. */
export function indentedName(n: BranchNode): string {
  return `${n.depth ? `${"  ".repeat(n.depth - 1)}└ ` : ""}${n.name}`;
}
