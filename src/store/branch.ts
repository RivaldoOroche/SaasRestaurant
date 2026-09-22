import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Sucursal activa del POS (persistida por dispositivo). null = todas. */
interface BranchState {
  branchId: string | null;
  setBranch: (id: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      branchId: null,
      setBranch: (id) => set({ branchId: id }),
    }),
    { name: "wayra-branch" },
  ),
);
