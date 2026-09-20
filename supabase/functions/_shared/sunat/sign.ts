// Firma digital XMLDSig (enveloped) para el UBL de SUNAT, usando Web Crypto
// (disponible en Deno y en Node 18+). RSA-SHA256.
//
// Enfoque: el XML se genera ya canónico (ver ubl.ts), con <ext:ExtensionContent>
// vacío. Firmamos el documento tal cual (con ese contenedor vacío) — que es
// exactamente lo que la transformación "enveloped" deja al remover la firma — y
// luego inyectamos el <ds:Signature> dentro de ExtensionContent.
//
// Nota de homologación: la canonicalización exacta debe validarse contra el
// ambiente beta de SUNAT. Como emitimos el XML nosotros en forma canónica, el
// digest es determinista; si SUNAT rechaza por C14N, la vía robusta es xmlsec1
// en el runtime o un OSE.

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256B64(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return b64(digest);
}

export interface CertMaterial {
  /** Llave privada en PEM PKCS#8 ("BEGIN PRIVATE KEY"). */
  privateKeyPem: string;
  /** Certificado X.509 en PEM ("BEGIN CERTIFICATE"). */
  certificatePem: string;
}

/** Firma el XML UBL e inserta el ds:Signature en ExtensionContent. */
export async function firmarUBL(xml: string, cert: CertMaterial): Promise<string> {
  const enc = new TextEncoder();

  // 1) Digest del documento (con ExtensionContent vacío) = enveloped sin firma.
  const digestValue = await sha256B64(enc.encode(xml));

  // 2) SignedInfo canónico.
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference URI="">` +
    `<ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
    `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
    `</ds:Reference></ds:SignedInfo>`;

  // 3) Firmar SignedInfo con la llave privada.
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(cert.privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signedInfo));
  const signatureValue = b64(sigBytes);

  const x509 = b64(pemToDer(cert.certificatePem));

  const signature =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Sign">` +
    signedInfo +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${x509}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `</ds:Signature>`;

  // 4) Inyectar la firma en el ExtensionContent vacío.
  return xml.replace(
    "<ext:ExtensionContent></ext:ExtensionContent>",
    `<ext:ExtensionContent>${signature}</ext:ExtensionContent>`,
  );
}
