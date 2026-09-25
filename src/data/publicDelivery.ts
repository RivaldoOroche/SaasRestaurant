import { supabase, USE_MOCK } from "@/lib/supabase";
import { MockRepo } from "./mock/MockRepo";
import type { DeliveryStatus, DeliveryTracking } from "./model";

/**
 * Estado de un pedido de delivery para el cliente, por su token secreto — sin
 * autenticación. Solo trae lo necesario (nunca dirección, teléfono ni montos).
 */
export async function getDeliveryTracking(token: string): Promise<DeliveryTracking | null> {
  if (USE_MOCK || !supabase) {
    // Demo: el estado vive en este navegador (mismo origen que el POS).
    return new MockRepo().getDeliveryTracking(token);
  }
  const { data, error } = await supabase.rpc("public_delivery_status", { p_token: token });
  if (error || !data) return null;
  const r = data as {
    tenant_name: string;
    code: string;
    status: DeliveryStatus;
    eta_min: number;
    driver_name: string | null;
    created_at: string;
    accepted_at: string | null;
    ready_at: string | null;
    dispatched_at: string | null;
    delivered_at: string | null;
    cancelled_at: string | null;
  };
  return {
    tenantName: r.tenant_name,
    code: r.code,
    status: r.status,
    etaMin: r.eta_min,
    driverName: r.driver_name,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
    readyAt: r.ready_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    cancelledAt: r.cancelled_at,
  };
}
