import { useEffect } from "react";
import { useBranches } from "@/data/hooks";
import { useBranchStore } from "@/store/branch";

/** Selector de sucursal activa (mesas, pedidos, caja y reportes se filtran por ella). */
export function BranchBar() {
  const { data: branches = [] } = useBranches();
  const branchId = useBranchStore((s) => s.branchId);
  const setBranch = useBranchStore((s) => s.setBranch);

  // Autoselecciona la primera sucursal si no hay ninguna válida elegida.
  useEffect(() => {
    if (branches.length === 0) return;
    if (!branchId || !branches.some((b) => b.id === branchId)) {
      setBranch(branches[0].id);
    }
  }, [branches, branchId, setBranch]);

  if (branches.length <= 1) return null;
  const active = branches.find((b) => b.id === branchId) ?? branches[0];

  return (
    <div className="flex items-center gap-2 bg-surface-alt border-b border-border-soft px-4 py-1.5 text-sm no-print">
      <span className="text-muted">🏬 Sucursal</span>
      <select
        value={active.id}
        onChange={(e) => setBranch(e.target.value)}
        className="rounded-md bg-chip-bg border border-border px-2 py-1 text-sm"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} · {b.city}
          </option>
        ))}
      </select>
    </div>
  );
}
