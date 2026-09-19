import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getRepo } from "./index";
import { useAuth } from "@/auth/AuthContext";
import type { DraftLine } from "./model";
import type { PayInput } from "./Repo";

export function useRepo() {
  const { session } = useAuth();
  return useMemo(() => getRepo(session?.tenantId ?? null), [session?.tenantId]);
}

/** Re-fetch live queries whenever the repo signals a change (KDS realtime / mock events). */
export function useRepoSubscription() {
  const repo = useRepo();
  const qc = useQueryClient();
  useEffect(() => {
    return repo.subscribe(() => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    });
  }, [repo, qc]);
}

export function useCategories() {
  const repo = useRepo();
  return useQuery({ queryKey: ["categories"], queryFn: () => repo.getCategories() });
}
export function useMenuItems() {
  const repo = useRepo();
  return useQuery({ queryKey: ["menuItems"], queryFn: () => repo.getMenuItems() });
}
export function useExtras() {
  const repo = useRepo();
  return useQuery({ queryKey: ["extras"], queryFn: () => repo.getExtras() });
}
export function usePrefs() {
  const repo = useRepo();
  return useQuery({ queryKey: ["prefs"], queryFn: () => repo.getPrefs() });
}
export function useTables() {
  const repo = useRepo();
  return useQuery({ queryKey: ["tables"], queryFn: () => repo.getTables() });
}
export function useOpenOrder(tableId: string | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["order", tableId],
    queryFn: () => (tableId ? repo.getOpenOrderForTable(tableId) : Promise.resolve(null)),
    enabled: tableId != null,
  });
}
export function useKitchenTickets() {
  const repo = useRepo();
  return useQuery({ queryKey: ["kitchen"], queryFn: () => repo.getKitchenTickets(), refetchInterval: 5000 });
}

/** Order mutations with cache invalidation. */
export function useOrderActions(tableId: string | null) {
  const repo = useRepo();
  const qc = useQueryClient();
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["order", tableId] });
    qc.invalidateQueries({ queryKey: ["tables"] });
    qc.invalidateQueries({ queryKey: ["kitchen"] });
  }, [qc, tableId]);

  const openOrder = useMutation({
    mutationFn: (tid: string) => repo.openOrder(tid),
    onSuccess: invalidate,
  });
  const addLine = useMutation({
    mutationFn: ({ orderId, line }: { orderId: string; line: DraftLine }) => repo.addLine(orderId, line),
    onSuccess: invalidate,
  });
  const setQty = useMutation({
    mutationFn: ({ lineId, qty }: { lineId: string; qty: number }) => repo.setLineQty(lineId, qty),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId: string) => repo.removeLine(lineId),
    onSuccess: invalidate,
  });
  const clearOrder = useMutation({
    mutationFn: (orderId: string) => repo.clearOrder(orderId),
    onSuccess: invalidate,
  });
  const sendToKitchen = useMutation({
    mutationFn: (orderId: string) => repo.sendToKitchen(orderId),
    onSuccess: invalidate,
  });
  const payOrder = useMutation({
    mutationFn: (input: PayInput) => repo.payOrder(input),
    onSuccess: invalidate,
  });

  return { openOrder, addLine, setQty, removeLine, clearOrder, sendToKitchen, payOrder };
}

export function useKitchenActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const advance = useMutation({
    mutationFn: (ticketId: string) => repo.advanceTicket(ticketId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kitchen"] }),
  });
  return { advance };
}
