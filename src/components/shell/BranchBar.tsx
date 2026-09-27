import { useEffect, useMemo } from "react";
import { useBranches } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { useBranchStore } from "@/store/branch";
import { buildTree, flatten, indentedName } from "@/lib/branchTree";

/** Selector de sucursal activa (mesas, pedidos, caja, cocina e inventario se filtran por ella). */
export function BranchBar() {
  const { data: branches = [] } = useBranches();
  const branchId = useBranchStore((s) => s.branchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const { session } = useAuth();
  // Personal asignado a ciertas sucursales solo ve esas (el dueño, todas).
  const allowedKey = session?.role !== "dueno" ? (session?.staff?.branchIds ?? []).join(",") : "";
  // En el orden del árbol: la principal primero y cada sucursal bajo su padre.
  const options = useMemo(
    () =>
      flatten(buildTree(branches.filter((b) => b.active !== false))).filter(
        (b) => !allowedKey || allowedKey.split(",").includes(b.id),
      ),
    [branches, allowedKey],
  );

  // Autoselecciona la sede principal si no hay una sucursal activa válida elegida.
  useEffect(() => {
    if (options.length === 0) return;
    if (!branchId || !options.some((b) => b.id === branchId)) setBranch(options[0].id);
  }, [options, branchId, setBranch]);

  if (options.length <= 1) return null;
  const active = options.find((b) => b.id === branchId) ?? options[0];

  return (
    <div className="flex items-center gap-2 bg-surface-alt border-b border-border-soft px-4 py-1.5 text-sm no-print">
      <label htmlFor="branch-select" className="text-muted">
        🏬 Sucursal
      </label>
      <select
        id="branch-select"
        value={active.id}
        onChange={(e) => setBranch(e.target.value)}
        className="rounded-md bg-chip-bg border border-border px-2 py-1 text-sm min-w-0 max-w-[60vw]"
      >
        {options.map((b) => (
          <option key={b.id} value={b.id}>
            {indentedName(b)}
            {b.parentId ? "" : " (principal)"}
            {b.city ? ` · ${b.city}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
