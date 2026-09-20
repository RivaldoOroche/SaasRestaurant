// Edge Function (Deno) — completa el alta de un tenant desde el link firmado.
// Valida el token (hash + expiración + no usado), crea el usuario dueño, lo
// vincula al tenant (membership rol 'dueno'), asegura business_settings y siembra
// datos mínimos (mesas + una categoría). Requiere service role.
//
//   body: { token, email, password, ownerName }  ->  { success, tenantId?, error? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { token, email, password, ownerName } = await req.json();
    if (!token || !email || !password) return json({ error: "Faltan token, email o contraseña" }, 400);
    if (String(password).length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta configuración de service role" }, 500);
    const admin = createClient(url, serviceKey);

    // 1) Validar token.
    const tokenHash = await sha256Hex(token);
    const { data: link } = await admin
      .from("onboarding_links")
      .select("id, tenant_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!link) return json({ error: "Enlace inválido" }, 400);
    if (link.used_at) return json({ error: "El enlace ya fue utilizado" }, 400);
    if (new Date(link.expires_at).getTime() < Date.now()) return json({ error: "El enlace expiró" }, 400);

    const tenantId = link.tenant_id as string;
    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

    // 2) Crear el usuario dueño (confirmado).
    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: ownerName ?? "" },
    });
    if (uErr || !created?.user) return json({ error: `No se pudo crear el usuario: ${uErr?.message ?? "desconocido"}` }, 400);
    const userId = created.user.id;

    // 3) Vincular como dueño.
    const { error: mErr } = await admin.from("memberships").insert({ user_id: userId, tenant_id: tenantId, role: "dueno" });
    if (mErr) return json({ error: `No se pudo vincular el usuario: ${mErr.message}` }, 400);

    // 4) Asegurar business_settings.
    await admin.from("business_settings").upsert({ tenant_id: tenantId, name: tenant?.name ?? "Mi negocio" });

    // 5) Siembra mínima: mesas + una categoría (idempotente por si se reintenta).
    const { count: tablesCount } = await admin
      .from("restaurant_tables")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (!tablesCount) {
      const zonas = ["Salón", "Salón", "Salón", "Terraza", "Terraza", "Barra"];
      await admin.from("restaurant_tables").insert(
        zonas.map((zone, i) => ({ tenant_id: tenantId, zone, number: i + 1, seats: zone === "Barra" ? 2 : 4, status: "libre" })),
      );
      await admin.from("menu_categories").insert({
        tenant_id: tenantId, key: "entradas", name: "Entradas", icon: "🍽️", subtitle: "Para empezar", sort: 1,
      });
    }

    // 6) Marcar el link como usado.
    await admin.from("onboarding_links").update({ used_at: new Date().toISOString() }).eq("id", link.id);

    return json({ success: true, tenantId });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}

(globalThis as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve(handler);
