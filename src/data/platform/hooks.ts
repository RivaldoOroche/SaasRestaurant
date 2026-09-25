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
export function useCohorts() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "cohorts"], queryFn: () => repo.getCohorts() });
}
export function useRevenueSeries() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "revenue"], queryFn: () => repo.getRevenueSeries() });
}
export function useActivity() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "activity"], queryFn: () => repo.getActivity(), refetchInterval: 8000 });
}
export function usePlatformSettings() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "settings"], queryFn: () => repo.getPlatformSettings() });
}
export function useAccessLog() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "accessLog"], queryFn: () => repo.getAccessLog() });
}
export function usePlanRequests() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "planRequests"], queryFn: () => repo.getPlanRequests() });
}
export function useChargeProposals() {
  const repo = useP();
  return useQuery({ queryKey: ["platform", "charges"], queryFn: () => repo.getChargeProposals() });
}

export function usePlatformActions() {
  const repo = useP();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["platform"] });
  const createTenant = useMutation({
    mutationFn: (input: NewTenantInput) => repo.createTenant(input),
    onSuccess: invalidate,
  });
  const createTenantWithOwner = useMutation({
    mutationFn: ({ input, credentials }: { input: NewTenantInput; credentials: { email: string; password: string } }) =>
      repo.createTenantWithOwner(input, credentials),
    onSuccess: invalidate,
  });
  const regenerateLink = useMutation({
    mutationFn: (id: string) => repo.regenerateLink(id),
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
  const updatePlan = useMutation({
    mutationFn: ({ tier, patch }: { tier: PlanTier; patch: { price?: number; features?: string } }) =>
      repo.updatePlan(tier, patch),
    onSuccess: invalidate,
  });
  const updateTicket = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: string; priority?: string } }) =>
      repo.updateTicket(id, patch),
    onSuccess: invalidate,
  });
  const updatePlatformSettings = useMutation({
    mutationFn: (patch: Parameters<typeof repo.updatePlatformSettings>[0]) => repo.updatePlatformSettings(patch),
    onSuccess: invalidate,
  });
  const setPlatformFiscalCredentials = useMutation({
    mutationFn: (input: Parameters<typeof repo.setPlatformFiscalCredentials>[0]) => repo.setPlatformFiscalCredentials(input),
    onSuccess: invalidate,
  });
  const proposeCharge = useMutation({
    mutationFn: (tenantId: string) => repo.proposeCharge(tenantId),
    onSuccess: invalidate,
  });
  const runDunning = useMutation({
    mutationFn: () => repo.runDunning(),
    onSuccess: invalidate,
  });
  const updateChargeProposal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { ruc?: string; razonSocial?: string; note?: string } }) =>
      repo.updateChargeProposal(id, patch),
    onSuccess: invalidate,
  });
  const approveCharge = useMutation({
    mutationFn: ({ id, method, token }: { id: string; method?: string; token?: string }) =>
      repo.approveCharge(id, method, token),
    onSuccess: invalidate,
  });
  const rejectCharge = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => repo.rejectCharge(id, reason),
    onSuccess: invalidate,
  });
  const decidePlanRequest = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => repo.decidePlanRequest(id, approve),
    onSuccess: invalidate,
  });
  return {
    createTenant,
    createTenantWithOwner,
    regenerateLink,
    setPlan,
    toggleSuspend,
    charge,
    updatePlan,
    updateTicket,
    updatePlatformSettings,
    setPlatformFiscalCredentials,
    proposeCharge,
    runDunning,
    updateChargeProposal,
    approveCharge,
    rejectCharge,
    decidePlanRequest,
  };
}
