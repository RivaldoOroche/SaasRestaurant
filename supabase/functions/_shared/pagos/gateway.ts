// Cobro con tarjeta multi-proveedor (Culqi, Izipay, Niubiz).
//
// La tarjeta se tokeniza en el navegador con la llave PÚBLICA del proveedor; el
// backend recibe solo el token y cobra con las credenciales SECRETAS del tenant
// (payment_credentials, leídas con el service role). Todos devuelven un
// `CargoResult` normalizado.

export interface PagoCreds {
  provider: string; // culqi | izipay | niubiz
  secretKey?: string;
  publicKey?: string;
  merchantId?: string;
  extra?: Record<string, unknown>;
}

export interface CargoInput {
  amountCents: number;
  currency: string; // PEN
  email: string;
  token: string; // token de tarjeta generado en el navegador
  description: string;
}

export interface CargoResult {
  success: boolean;
  chargeId?: string;
  provider?: string;
  error?: string;
}

function b64(s: string): string {
  // btoa está disponible en Deno.
  return btoa(s);
}

/** Culqi — cargo directo con el token (source_id) y la llave secreta. */
async function chargeCulqi(creds: PagoCreds, input: CargoInput): Promise<CargoResult> {
  if (!creds.secretKey) return { success: false, error: "Falta la llave secreta de Culqi", provider: "culqi" };
  const resp = await fetch("https://api.culqi.com/v2/charges", {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountCents,
      currency_code: input.currency,
      email: input.email,
      source_id: input.token,
      description: input.description || "Cobro POS",
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as { id?: string; user_message?: string; merchant_message?: string };
  if (resp.ok && data?.id) return { success: true, chargeId: data.id, provider: "culqi" };
  return { success: false, error: String(data?.user_message || data?.merchant_message || `Culqi HTTP ${resp.status}`), provider: "culqi" };
}

/**
 * Izipay (plataforma Lyra / micuentaweb). Cargo servidor-a-servidor con el
 * token de pago (formToken/paymentMethodToken) vía Charge/CreatePayment y
 * autenticación Basic (usuario = código de tienda, clave = password de API).
 */
async function chargeIzipay(creds: PagoCreds, input: CargoInput): Promise<CargoResult> {
  const user = creds.merchantId; // shopId / código de tienda
  const pass = creds.secretKey; // password de API (producción o test)
  const endpoint = String(creds.extra?.endpoint ?? "https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment");
  if (!user || !pass) return { success: false, error: "Faltan credenciales Izipay (código de tienda y password de API)", provider: "izipay" };
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Basic ${b64(`${user}:${pass}`)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountCents,
      currency: input.currency,
      paymentMethodToken: input.token,
      customer: { email: input.email },
      orderId: (input.description || "POS").slice(0, 32),
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    status?: string;
    answer?: { orderStatus?: string; transactions?: { uuid?: string }[] };
    errorMessage?: string;
  };
  const ok = resp.ok && (data.status === "SUCCESS" || data.answer?.orderStatus === "PAID");
  if (ok) return { success: true, chargeId: data.answer?.transactions?.[0]?.uuid ?? "izipay", provider: "izipay" };
  return { success: false, error: String(data.errorMessage || `Izipay HTTP ${resp.status}`), provider: "izipay" };
}

/**
 * Niubiz (VisaNet / Pagoefectivo). Autoriza con el transactionToken generado
 * por el checkout y el merchantId, usando un token de sesión Bearer.
 */
async function chargeNiubiz(creds: PagoCreds, input: CargoInput): Promise<CargoResult> {
  const merchantId = creds.merchantId;
  const bearer = creds.secretKey; // access token de la sesión Niubiz (obtenido con user/pass de seguridad)
  if (!merchantId || !bearer) return { success: false, error: "Faltan credenciales Niubiz (merchantId y token de acceso)", provider: "niubiz" };
  const base = String(creds.extra?.endpoint ?? "https://apiprod.vnforapps.com");
  const resp = await fetch(`${base}/api.authorization/v3/authorization/ecommerce/${merchantId}`, {
    method: "POST",
    headers: { Authorization: bearer, "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: "web",
      captureType: "manual",
      countable: true,
      order: {
        purchaseNumber: String(Date.now()).slice(-12),
        amount: input.amountCents / 100,
        currency: input.currency,
      },
      card: { tokenId: input.token },
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    dataMap?: { STATUS?: string; TRANSACTION_ID?: string; ACTION_DESCRIPTION?: string };
    errorMessage?: string;
  };
  const ok = resp.ok && data.dataMap?.STATUS === "Authorized";
  if (ok) return { success: true, chargeId: data.dataMap?.TRANSACTION_ID ?? "niubiz", provider: "niubiz" };
  return { success: false, error: String(data.dataMap?.ACTION_DESCRIPTION || data.errorMessage || `Niubiz HTTP ${resp.status}`), provider: "niubiz" };
}

/** Enruta el cargo según el proveedor configurado por el tenant. */
export function cobrarTarjeta(creds: PagoCreds, input: CargoInput): Promise<CargoResult> {
  switch (creds.provider) {
    case "culqi":
      return chargeCulqi(creds, input);
    case "izipay":
      return chargeIzipay(creds, input);
    case "niubiz":
      return chargeNiubiz(creds, input);
    default:
      return Promise.resolve({ success: false, error: `Proveedor de tarjeta no soportado: ${creds.provider}`, provider: creds.provider });
  }
}
