import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getRepo } from "./index";
import {
  pushSupported,
  pushConfigured,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
} from "@/lib/push";
import { useAuth } from "@/auth/AuthContext";
import { useBranchStore } from "@/store/branch";
import type { DraftLine, NewDeliveryInput, DeliveryStatus, DeliveryZone, DeliveryDriver } from "./model";
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
      qc.invalidateQueries({ queryKey: ["delivery"] });
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
export function useBranches() {
  const repo = useRepo();
  return useQuery({ queryKey: ["branches"], queryFn: () => repo.getBranches() });
}
export function useTables() {
  const repo = useRepo();
  const branchId = useBranchStore((s) => s.branchId);
  return useQuery({ queryKey: ["tables", branchId], queryFn: () => repo.getTables(branchId) });
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
  const branchId = useBranchStore((s) => s.branchId);
  return useQuery({ queryKey: ["kitchen", branchId], queryFn: () => repo.getKitchenTickets(branchId), refetchInterval: 5000 });
}
export function useBranchSales() {
  const repo = useRepo();
  return useQuery({ queryKey: ["branchSales"], queryFn: () => repo.getBranchSales() });
}
export function useStaff() {
  const repo = useRepo();
  return useQuery({ queryKey: ["staff"], queryFn: () => repo.getStaff() });
}

/** Gestión de sucursales (dueño). */
export function useBranchActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["branches"] });
    qc.invalidateQueries({ queryKey: ["branchSales"] });
  };
  const addBranch = useMutation({
    mutationFn: ({ name, city }: { name: string; city: string }) => repo.addBranch(name, city),
    onSuccess: invalidate,
  });
  const updateBranch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof repo.updateBranch>[1] }) =>
      repo.updateBranch(id, patch),
    onSuccess: invalidate,
  });
  const removeBranch = useMutation({
    mutationFn: (id: string) => repo.removeBranch(id),
    onSuccess: invalidate,
  });
  return { addBranch, updateBranch, removeBranch };
}

/** Gestión de personal (dueño). */
export function useStaffActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["staff"] });
  const addStaff = useMutation({
    mutationFn: (input: Parameters<typeof repo.addStaff>[0]) => repo.addStaff(input),
    onSuccess: invalidate,
  });
  const updateStaff = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof repo.updateStaff>[1] }) =>
      repo.updateStaff(id, patch),
    onSuccess: invalidate,
  });
  const setStaffPin = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => repo.setStaffPin(id, pin),
    onSuccess: invalidate,
  });
  return { addStaff, updateStaff, setStaffPin };
}
export function useOpenOrders() {
  const repo = useRepo();
  const branchId = useBranchStore((s) => s.branchId);
  return useQuery({ queryKey: ["openOrders", branchId], queryFn: () => repo.getOpenOrders(branchId) });
}
export function usePaidOrders() {
  const repo = useRepo();
  const branchId = useBranchStore((s) => s.branchId);
  return useQuery({ queryKey: ["paidOrders", branchId], queryFn: () => repo.getPaidOrders(branchId) });
}
export function useCustomers() {
  const repo = useRepo();
  return useQuery({ queryKey: ["customers"], queryFn: () => repo.getCustomers() });
}
export function useInventory() {
  const repo = useRepo();
  return useQuery({ queryKey: ["inventory"], queryFn: () => repo.getInventory() });
}
export function useRecipes() {
  const repo = useRepo();
  return useQuery({ queryKey: ["recipes"], queryFn: () => repo.getRecipes() });
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
export function useComplaints() {
  const repo = useRepo();
  return useQuery({ queryKey: ["complaints"], queryFn: () => repo.getComplaints() });
}
export function useSubscription() {
  const repo = useRepo();
  return useQuery({ queryKey: ["subscription"], queryFn: () => repo.getSubscription() });
}
export function useMyPlanRequest() {
  const repo = useRepo();
  return useQuery({ queryKey: ["myPlanRequest"], queryFn: () => repo.getMyPlanRequest() });
}
export function useSubscriptionActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const requestPlanChange = useMutation({
    mutationFn: (toPlan: string) => repo.requestPlanChange(toPlan),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myPlanRequest"] }),
  });
  return { requestPlanChange };
}
export function useRolePermissions() {
  const repo = useRepo();
  return useQuery({ queryKey: ["rolePermissions"], queryFn: () => repo.getRolePermissions() });
}
export function usePermissionActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const setRolePermissions = useMutation({
    mutationFn: ({ role, screens }: { role: string; screens: string[] }) => repo.setRolePermissions(role, screens),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rolePermissions"] }),
  });
  return { setRolePermissions };
}
export function useReservations() {
  const repo = useRepo();
  return useQuery({ queryKey: ["reservations"], queryFn: () => repo.getReservations() });
}
export function useWaitlist() {
  const repo = useRepo();
  return useQuery({ queryKey: ["waitlist"], queryFn: () => repo.getWaitlist() });
}
export function useReservaActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["reservations"] });
    qc.invalidateQueries({ queryKey: ["waitlist"] });
  };
  const addReservation = useMutation({ mutationFn: (i: Parameters<typeof repo.addReservation>[0]) => repo.addReservation(i), onSuccess: inv });
  const updateReservation = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof repo.updateReservation>[1] }) => repo.updateReservation(id, patch), onSuccess: inv });
  const removeReservation = useMutation({ mutationFn: (id: string) => repo.removeReservation(id), onSuccess: inv });
  const addWaitlist = useMutation({ mutationFn: (i: Parameters<typeof repo.addWaitlist>[0]) => repo.addWaitlist(i), onSuccess: inv });
  const updateWaitlist = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof repo.updateWaitlist>[1] }) => repo.updateWaitlist(id, patch), onSuccess: inv });
  const removeWaitlist = useMutation({ mutationFn: (id: string) => repo.removeWaitlist(id), onSuccess: inv });
  return { addReservation, updateReservation, removeReservation, addWaitlist, updateWaitlist, removeWaitlist };
}
export function useComplaintActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) => repo.respondComplaint(id, response),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaints"] }),
  });
  return { respond };
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
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["paidOrders"] });
      qc.invalidateQueries({ queryKey: ["openOrders"] });
      qc.invalidateQueries({ queryKey: ["branchSales"] });
    },
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

/** Configuración de mesas (gerencia). */
export function useTableActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tables"] });
  const addTable = useMutation({
    mutationFn: (input: Parameters<typeof repo.addTable>[0]) => repo.addTable(input),
    onSuccess: invalidate,
  });
  const updateTable = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof repo.updateTable>[1] }) =>
      repo.updateTable(id, patch),
    onSuccess: invalidate,
  });
  const removeTable = useMutation({
    mutationFn: (id: string) => repo.removeTable(id),
    onSuccess: invalidate,
  });
  return { addTable, updateTable, removeTable };
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
  const notaCredito = useMutation({
    mutationFn: ({ originalId, motivo, online }: { originalId: string; motivo: string; online: boolean }) =>
      repo.emitNotaCredito(originalId, motivo, online),
    onSuccess: invalidate,
  });
  const resumen = useMutation({
    mutationFn: (online: boolean) => repo.sendResumenDiario(online),
    onSuccess: invalidate,
  });
  const baja = useMutation({
    mutationFn: ({ comprobanteId, motivo, online }: { comprobanteId: string; motivo: string; online: boolean }) =>
      repo.comunicarBaja(comprobanteId, motivo, online),
    onSuccess: invalidate,
  });
  return { emit, sync, retry, notaCredito, resumen, baja };
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
  const setCardCredentials = useMutation({
    mutationFn: (input: Parameters<typeof repo.setCardCredentials>[0]) => repo.setCardCredentials(input),
  });
  const setFiscalCredentials = useMutation({
    mutationFn: (input: Parameters<typeof repo.setFiscalCredentials>[0]) => repo.setFiscalCredentials(input),
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
  const setRecipe = useMutation({
    mutationFn: ({ menuItemId, lines }: { menuItemId: string; lines: { inventoryId: string; qtyPerUnit: number }[] }) =>
      repo.setRecipe(menuItemId, lines),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });
  return {
    adjustInventory,
    reviewChange,
    updateSettings,
    setCardCredentials,
    setFiscalCredentials,
    setMenuPrice,
    setMenuAvailable,
    setRecipe,
  };
}

// --- Notificaciones push (Web Push) ---
export function usePushNotifications() {
  const repo = useRepo();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = pushSupported();
  const configured = pushConfigured();

  useEffect(() => {
    let alive = true;
    isPushSubscribed().then((v) => alive && setSubscribed(v));
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await subscribeToPush();
      await repo.savePushSubscription(data);
      setSubscribed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [repo]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await repo.removePushSubscription(endpoint);
      setSubscribed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [repo]);

  return { supported, configured, subscribed, busy, error, enable, disable };
}

// --- Delivery ---
export function useDeliveryOrders() {
  const repo = useRepo();
  // Realtime invalida al instante con Supabase; el sondeo cubre el modo demo
  // (otras pestañas) y reconexiones.
  const branchId = useBranchStore((s) => s.branchId);
  return useQuery({
    queryKey: ["delivery", "orders"],
    queryFn: () => repo.getDeliveryOrders(),
    refetchInterval: 15_000,
    // Cada sucursal ve y despacha sus propios pedidos (los sin sucursal, en todas).
    select: (list) => list.filter((o) => !branchId || !o.branchId || o.branchId === branchId),
  });
}
export function useDeliveryZones() {
  const repo = useRepo();
  return useQuery({ queryKey: ["delivery", "zones"], queryFn: () => repo.getDeliveryZones() });
}
export function useDrivers() {
  const repo = useRepo();
  return useQuery({ queryKey: ["delivery", "drivers"], queryFn: () => repo.getDrivers() });
}
export function useDeliveryActions() {
  const repo = useRepo();
  const qc = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["delivery"] });
    qc.invalidateQueries({ queryKey: ["kitchen"] });
  };
  return {
    create: useMutation({
      mutationFn: (input: NewDeliveryInput) => repo.createDeliveryOrder({ ...input, branchId: input.branchId ?? branchId }),
      onSuccess: refresh,
    }),
    setStatus: useMutation({
      mutationFn: (v: { id: string; to: DeliveryStatus; driverId?: string | null; cancelReason?: string }) =>
        repo.setDeliveryStatus(v.id, v.to, { driverId: v.driverId, cancelReason: v.cancelReason }),
      onSuccess: refresh,
      onError: refresh, // p. ej. otro usuario ya lo movió: refresca el tablero
    }),
    saveZone: useMutation({ mutationFn: (z: Omit<DeliveryZone, "id"> & { id?: string }) => repo.saveDeliveryZone(z), onSuccess: refresh }),
    removeZone: useMutation({ mutationFn: (id: string) => repo.removeDeliveryZone(id), onSuccess: refresh }),
    saveDriver: useMutation({ mutationFn: (d: Omit<DeliveryDriver, "id"> & { id?: string }) => repo.saveDriver(d), onSuccess: refresh }),
    removeDriver: useMutation({ mutationFn: (id: string) => repo.removeDriver(id), onSuccess: refresh }),
  };
}
