import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getPlatformRepo } from "./index";
import type { NewTenantInput, PlanTier } from "./model";

function useP() {
  return useMemo(() => getPlatformRepo(), []);
}

export function usePlatformSubscription() {
  const repo = useP();
  const qc = useQueryClient();
  useEffect(() => repo.subscribe(() => qc.invalidateQueries({ queryKey: ["platform"] })), [repo, qc]);
}

export function useSummary() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "summary"], queryFn: () => repo.getSummary() });
}
export function useTenants() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "tenants"], queryFn: () => repo.getTenants() });
}
export function usePlans() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "plans"], queryFn: () => repo.getPlans() });
}
export function useInvoices() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "invoices"], queryFn: () => repo.getInvoices() });
}
export function useTickets() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "tickets"], queryFn: () => repo.getTickets() });
}
export function useRetention() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "retention"], queryFn: () => repo.getRetention() });
}

export function usePlatformActions() {
  const repo = useP();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["platform"] });
  const createTenant = useMutation({
    mutationFn: (input: NewTenantInput) => repo.createTenant(input),
    onSuccess: invalidate,
  });
  const setPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: PlanTier }) => repo.setTenantPlan(id, plan),
    onSuccess: invalidate,
  });
  const toggleSuspend = useMutation({
    mutationFn: (id: string) => repo.toggleSuspend(id),
    onSuccess: invalidate,
  });
  const charge = useMutation({
    mutationFn: ({ id, method, token }: { id: string; method: string; token?: string }) =>
      repo.chargeTenant(id, method, token),
    onSuccess: invalidate,
  });
  return { createTenant, setPlan, toggleSuspend, charge };
}
