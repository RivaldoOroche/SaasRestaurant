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
export function useOpenOrders() {
  const repo = useRepo();
  return useQuery({ queryKey: ["openOrders"], queryFn: () => repo.getOpenOrders() });
}
export function usePaidOrders() {
  const repo = useRepo();
  return useQuery({ queryKey: ["paidOrders"], queryFn: () => repo.getPaidOrders() });
}
export function useCustomers() {
  const repo = useRepo();
  return useQuery({ queryKey: ["customers"], queryFn: () => repo.getCustomers() });
}
export function useInventory() {
  const repo = useRepo();
  return useQuery({ queryKey: ["inventory"], queryFn: () => repo.getInventory() });
}
export function useMenuChanges() {
  const repo = useRepo();
  return useQuery({ queryKey: ["menuChanges"], queryFn: () => repo.getMenuChanges() });
}
export function useOnlineOrders() {
  const repo = useRepo();
  return useQuery({ queryKey: ["onlineOrders"], queryFn: () => repo.getOnlineOrders() });
}
export function useSettings() {
  const repo = useRepo();
  return useQuery({ queryKey: ["settings"], queryFn: () => repo.getSettings() });
}
export function useActivityLog() {
  const repo = useRepo();
  return useQuery({ queryKey: ["activityLog"], queryFn: () => repo.getActivityLog(), refetchInterval: 4000 });
}
export function useComprobantes() {
  const repo = useRepo();
  return useQuery({ queryKey: ["comprobantes"], queryFn: () => repo.getComprobantes() });
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

/** Floor actions: void a line, transfer or merge an order between tables. */
export function useFloorActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["order"] });
    qc.invalidateQueries({ queryKey: ["openOrders"] });
    qc.invalidateQueries({ queryKey: ["tables"] });
    qc.invalidateQueries({ queryKey: ["activityLog"] });
  };
  const voidLine = useMutation({
    mutationFn: ({ lineId, reason, actor }: { lineId: string; reason: string; actor: string }) =>
      repo.voidLine(lineId, reason, actor),
    onSuccess: invalidate,
  });
  const transfer = useMutation({
    mutationFn: ({ orderId, toTableId }: { orderId: string; toTableId: string }) =>
      repo.transferOrder(orderId, toTableId),
    onSuccess: invalidate,
  });
  const merge = useMutation({
    mutationFn: ({ orderId, intoTableId }: { orderId: string; intoTableId: string }) =>
      repo.mergeOrder(orderId, intoTableId),
    onSuccess: invalidate,
  });
  return { voidLine, transfer, merge };
}

/** SUNAT emission / sync / retry. */
export function useSunatActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["comprobantes"] });
    qc.invalidateQueries({ queryKey: ["activityLog"] });
  };
  const emit = useMutation({
    mutationFn: ({ input, online }: { input: Parameters<typeof repo.emitComprobante>[0]; online: boolean }) =>
      repo.emitComprobante(input, online),
    onSuccess: invalidate,
  });
  const sync = useMutation({
    mutationFn: (online: boolean) => repo.syncSunat(online),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: ({ id, online }: { id: string; online: boolean }) => repo.retryComprobante(id, online),
    onSuccess: invalidate,
  });
  return { emit, sync, retry };
}

/** Admin/tenant management actions. */
export function useTenantActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const adjustInventory = useMutation({
    mutationFn: ({ itemId, delta, actor }: { itemId: string; delta: number; actor: string }) =>
      repo.adjustInventory(itemId, delta, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["activityLog"] });
    },
  });
  const reviewChange = useMutation({
    mutationFn: ({ id, approve, actor }: { id: string; approve: boolean; actor: string }) =>
      repo.reviewChange(id, approve, actor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menuChanges"] });
      qc.invalidateQueries({ queryKey: ["activityLog"] });
    },
  });
  const updateSettings = useMutation({
    mutationFn: (patch: Parameters<typeof repo.updateSettings>[0]) => repo.updateSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
  const setMenuPrice = useMutation({
    mutationFn: ({ itemId, price }: { itemId: string; price: number }) => repo.setMenuPrice(itemId, price),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menuItems"] }),
  });
  const setMenuAvailable = useMutation({
    mutationFn: ({ itemId, available }: { itemId: string; available: boolean }) =>
      repo.setMenuAvailable(itemId, available),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menuItems"] }),
  });
  return { adjustInventory, reviewChange, updateSettings, setMenuPrice, setMenuAvailable };
}
