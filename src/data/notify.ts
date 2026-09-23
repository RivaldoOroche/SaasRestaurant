import { supabase, isBackendConfigured } from "@/lib/supabase";

export interface NotifyInput {
  channel?: "email" | "whatsapp";
  to: string;
  subject?: string;
  message: string; // HTML para correo, texto para WhatsApp
}

/**
 * Envía una notificación best-effort vía la Edge Function `notificar`.
 * En modo demo (sin backend) es un no-op silencioso.
 */
export async function sendNotification(input: NotifyInput): Promise<{ ok: boolean; error?: string }> {
  if (!isBackendConfigured || !supabase || !input.to) return { ok: true };
  const { data, error } = await supabase.functions.invoke("notificar", {
    body: {
      channel: input.channel ?? "email",
      to: input.to,
      subject: input.subject ?? "Notificación",
      message: input.message,
    },
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  return { ok: !!r.ok, error: r.error };
}
