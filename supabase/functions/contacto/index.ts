// Edge Function (Deno) — recibe los mensajes de contacto de la landing.
// Inserta en contact_messages (service role) y avisa por correo al equipo.
//
//   body: { nombre, negocio?, email, telefono?, mensaje?, origen? }
//   -> { success, error? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarEmail } from "../_shared/notificaciones/mailer.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function env(k: string, def = ""): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? def;
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json();
    const nombre = String(b.nombre ?? "").trim();
    const email = String(b.email ?? "").trim();
    if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "Nombre y correo válidos son obligatorios" }, 400);
    }
    const row = {
      nombre,
      negocio: String(b.negocio ?? "").trim() || null,
      email,
      telefono: String(b.telefono ?? "").trim() || null,
      mensaje: String(b.mensaje ?? "").trim() || null,
      origen: String(b.origen ?? "landing").slice(0, 40),
    };

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey) {
      const admin = createClient(url, serviceKey);
      await admin.from("contact_messages").insert(row);
      // Aviso por correo al equipo (best-effort).
      const { data: ps } = await admin.from("platform_settings").select("billing_email").eq("id", true).maybeSingle();
      const to = (ps?.billing_email as string | undefined) || env("NOTIFY_TO");
      if (to) {
        await enviarEmail(
          to,
          `Nuevo contacto desde la web — ${row.nombre}`,
          `<p>Nuevo lead desde la landing:</p>
           <ul>
             <li><b>Nombre:</b> ${esc(row.nombre)}</li>
             <li><b>Negocio:</b> ${esc(row.negocio ?? "-")}</li>
             <li><b>Correo:</b> ${esc(row.email)}</li>
             <li><b>Teléfono:</b> ${esc(row.telefono ?? "-")}</li>
           </ul>
           <p>${esc(row.mensaje ?? "")}</p>`,
        );
      }
    }
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
