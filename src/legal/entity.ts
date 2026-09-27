// Datos de la empresa titular del servicio que aparecen en los documentos
// legales. ANTES DE PUBLICAR: reemplaza los valores entre corchetes por los
// datos reales inscritos en SUNAT y en Registros Públicos.
export const LEGAL_ENTITY = {
  razonSocial: "Wayra POS S.A.C.",
  nombreComercial: "Wayra POS",
  ruc: "[RUC de la empresa]",
  domicilio: "[Domicilio fiscal, distrito, provincia y departamento]",
  emailLegal: "legal@wayrapos.pe",
  emailPrivacidad: "privacidad@wayrapos.pe",
  emailSoporte: "soporte@wayrapos.pe",
  whatsappSoporte: "[Número de WhatsApp de soporte]",
  sitio: "wayrapos.pe",
  /** Proveedores que procesan datos por cuenta de Wayra (subencargados). */
  subencargados: [
    { nombre: "Supabase Inc.", servicio: "Base de datos, autenticación y funciones en la nube", pais: "Estados Unidos (infraestructura de Amazon Web Services)" },
    { nombre: "Vercel Inc.", servicio: "Alojamiento de la aplicación web", pais: "Estados Unidos" },
    { nombre: "Proveedor de facturación electrónica (OSE/PSE) elegido por el restaurante", servicio: "Firma y envío de comprobantes a SUNAT", pais: "Perú" },
    { nombre: "Pasarela de pagos elegida por el restaurante (Culqi, Izipay o Niubiz)", servicio: "Cobros con tarjeta; Wayra no almacena números de tarjeta", pais: "Perú" },
    { nombre: "Proveedor de correo transaccional", servicio: "Envío de correos del servicio", pais: "Estados Unidos" },
    { nombre: "Functional Software Inc. (Sentry), solo si se activa", servicio: "Registro de errores técnicos, sin datos de comensales", pais: "Estados Unidos" },
  ],
} as const;
