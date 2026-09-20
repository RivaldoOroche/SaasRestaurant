import type { CardInput } from "@/data/model";

// Tokeniza la tarjeta con el proveedor usando su llave PÚBLICA. La tarjeta va
// directo al proveedor (Culqi, etc.), nunca a nuestro backend. Devuelve el token
// (source_id) que luego la Edge Function usa para ejecutar el cargo.
export async function tokenizeCard(provider: string, publicKey: string, card: CardInput): Promise<string> {
  if (provider === "culqi") {
    const resp = await fetch("https://secure.culqi.com/v2/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${publicKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        card_number: card.number.replace(/\s+/g, ""),
        cvv: card.cvv,
        expiration_month: card.expMonth,
        expiration_year: card.expYear,
        email: card.email,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data?.id) return data.id as string;
    throw new Error(data?.user_message || data?.merchant_message || "No se pudo tokenizar la tarjeta");
  }
  throw new Error(`Tokenización con ${provider} no está implementada en el cliente`);
}
