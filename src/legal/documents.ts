// Documentos legales de Wayra POS, versionados. Si cambias el contenido de un
// documento que el cliente acepta (acceptance: true), sube su `version`: la app
// pedirá al dueño de cada restaurante aceptar la nueva versión.
//
// Marco normativo considerado (Perú, 2026):
//   · Ley 29733 de Protección de Datos Personales y su Reglamento (D.S. 016-2024-JUS,
//     vigente desde el 30/03/2025): deber de informar, encargo de tratamiento,
//     derechos ARCO y portabilidad, flujo transfronterizo, incidentes (48 h).
//   · Ley 29571, Código de Protección y Defensa del Consumidor: precios finales,
//     cláusulas abusivas, Libro de Reclamaciones.
//   · D.S. 006-2014-PCM (contratos de adhesión): términos claros; renovación
//     automática solo con aviso previo; cancelar tan fácil como contratar.
//   · Código Civil (arts. 141 y 1374: manifestación de voluntad y contratación
//     por medios electrónicos) y normativa de comprobantes electrónicos de SUNAT.
// Este texto es una base sólida, no reemplaza la revisión de un abogado.
import { LEGAL_ENTITY as E } from "./entity";

export { LEGAL_ENTITY } from "./entity";

export type LegalDocId = "terminos" | "privacidad" | "encargo" | "cookies" | "comensales";

export interface LegalSection {
  h: string;
  p: string[];
}

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  version: string;
  updated: string; // ISO
  /** Lo acepta el dueño del restaurante al contratar (y en cada nueva versión). */
  acceptance: boolean;
  summary: string;
  sections: LegalSection[];
}

const UPDATED = "2026-09-27";

const TERMINOS: LegalDoc = {
  id: "terminos",
  title: "Términos y Condiciones del Servicio",
  version: "2026-09",
  updated: UPDATED,
  acceptance: true,
  summary:
    "Contrato entre Wayra POS y el restaurante que usa el sistema: qué incluye, cuánto cuesta, cómo se renueva y cancela, qué hace cada parte y qué pasa con los datos al terminar.",
  sections: [
    {
      h: "1. Partes y aceptación",
      p: [
        `Estos términos regulan el uso del software Wayra POS, prestado por ${E.razonSocial} (RUC ${E.ruc}, domicilio en ${E.domicilio}) —en adelante, «Wayra»— a la persona natural o jurídica que lo contrata para su negocio —en adelante, «el Cliente» o «el restaurante»—.`,
        "El Cliente acepta estos términos al marcar la casilla de aceptación al crear su cuenta, lo que tiene la misma validez que una firma (artículos 141 y 1374 del Código Civil). Quien acepta en nombre de una empresa declara tener facultades para hacerlo.",
        "Wayra guarda el registro de cada aceptación (versión, fecha, hora y usuario). El Cliente puede descargar y guardar estos términos en cualquier momento desde esta página.",
      ],
    },
    {
      h: "2. Qué es el servicio",
      p: [
        "Wayra POS es un sistema en la nube para restaurantes: toma de pedidos, mesas, cocina, caja, delivery, carta digital, inventario, recetas, reportes, programa de clientes y emisión de comprobantes electrónicos a través del proveedor de facturación que el Cliente elija.",
        "El servicio funciona desde el navegador en computadoras, tablets y celulares. Si se cae el internet, el sistema sigue registrando pedidos y cobros en el equipo y los sincroniza al volver la conexión; algunas funciones que dependen de terceros (cobro con tarjeta en línea, envío a SUNAT, pantalla de cocina en otro equipo) se completan al reconectar.",
        "Todas las funciones están disponibles en todos los planes. Los planes se diferencian por la cantidad de sucursales permitidas y el nivel de soporte.",
      ],
    },
    {
      h: "3. Planes, precios y pago",
      p: [
        "Los precios publicados son precios finales en soles e incluyen IGV. El plan Básico permite la sede principal y hasta 2 sucursales; el Pro, hasta 10 sucursales; el Enterprise, sucursales ilimitadas.",
        "El pago es mensual o anual, por adelantado. El pago anual equivale a 10 meses. Wayra emite el comprobante electrónico correspondiente por cada pago.",
        "Wayra puede cambiar sus precios avisando al Cliente por correo con al menos 30 días calendario de anticipación. El nuevo precio se aplica desde el siguiente periodo; si el Cliente no está de acuerdo, puede cancelar antes sin penalidad. Los periodos ya pagados no cambian de precio.",
        "Si un pago no se realiza, Wayra avisará al Cliente y le dará un plazo mínimo de 7 días calendario para regularizarlo antes de suspender el servicio. Durante la suspensión los datos se conservan y el Cliente puede descargarlos.",
      ],
    },
    {
      h: "4. Prueba gratuita, renovación y cancelación",
      p: [
        "La prueba gratuita dura 14 días y no requiere tarjeta. Al terminar, el servicio solo continúa si el Cliente elige un plan y paga.",
        "Los planes se renuevan al final de cada periodo. En los planes anuales, Wayra enviará un recordatorio por correo al menos 30 días antes de la renovación, con el monto y el enlace para cancelar.",
        "No hay permanencia mínima. El Cliente puede cancelar en cualquier momento desde la sección «Plan» del sistema o escribiendo a " + E.emailSoporte + ", con el mismo nivel de facilidad con que contrató. La cancelación surte efecto al final del periodo pagado.",
        "Si el Cliente cancela un plan anual, puede solicitar la devolución de los meses completos no usados, descontando el beneficio del descuento anual (se recalcula como meses a precio mensual). Si Wayra termina el servicio sin causa imputable al Cliente, devolverá la parte proporcional no usada.",
      ],
    },
    {
      h: "5. Obligaciones de Wayra",
      p: [
        "Mantener el servicio disponible con un objetivo de 99,5 % mensual, excluyendo mantenimientos programados avisados con 48 horas de anticipación y caídas de proveedores de internet o de terceros (SUNAT, OSE, pasarelas de pago).",
        "Realizar copias de seguridad diarias de la información y conservarlas al menos 7 días.",
        "Proteger la información con medidas técnicas y organizativas: cifrado en tránsito, aislamiento de los datos de cada restaurante, control de acceso por roles, registro de cambios sensibles y doble factor para el dueño.",
        "Brindar soporte en los canales y horarios del plan contratado y comunicar oportunamente cambios relevantes del servicio.",
        "Tratar los datos personales que el Cliente registre solo para prestar el servicio, conforme al Acuerdo de Encargo de Tratamiento de Datos, que forma parte de estos términos.",
      ],
    },
    {
      h: "6. Obligaciones del Cliente",
      p: [
        "Registrar información veraz de su negocio (RUC, razón social, dirección fiscal) y mantener actualizada su configuración tributaria, incluido el régimen de IGV que le corresponde.",
        "Cuidar las contraseñas y PIN de su personal, dar de baja a quien ya no trabaje en el negocio y usar el sistema conforme a la ley.",
        "Cumplir sus propias obligaciones como responsable de los datos de sus comensales y trabajadores (informarles, atender sus derechos, inscribir sus bancos de datos ante la Autoridad Nacional de Protección de Datos Personales cuando corresponda) y mantener su Libro de Reclamaciones.",
        "Contratar y configurar su proveedor de facturación electrónica y su pasarela de pagos, cuyos términos acepta directamente con esos proveedores.",
        "No intentar acceder a datos de otros clientes, vulnerar la seguridad del sistema ni revender el servicio sin autorización escrita.",
      ],
    },
    {
      h: "7. Comprobantes electrónicos e impuestos",
      p: [
        "Wayra genera los comprobantes con los datos y la configuración tributaria que el Cliente registra, y los envía a SUNAT a través del proveedor de facturación elegido. El Cliente es el emisor de sus comprobantes y responsable de su contenido tributario.",
        "Cuando no hay internet, los comprobantes se numeran con la serie de cada caja y se envían al reconectar, dentro de los plazos de SUNAT. El sistema muestra cuáles están pendientes para que el Cliente pueda actuar.",
      ],
    },
    {
      h: "8. Propiedad de la información y salida",
      p: [
        "Los datos del negocio (ventas, carta, clientes, inventario, comprobantes) pertenecen al Cliente. Wayra no los vende ni los usa para fines propios distintos de prestar y mejorar el servicio con información agregada y anónima.",
        "El Cliente puede exportar su información en cualquier momento (Excel y XML/CDR de comprobantes). Al terminar el contrato, Wayra mantendrá la cuenta en modo solo lectura durante 60 días para que el Cliente descargue su información; luego la eliminará, salvo lo que la ley obligue a conservar.",
        "El software, la marca y los diseños de Wayra son de su propiedad. El contrato da al Cliente una licencia de uso no exclusiva mientras esté vigente.",
      ],
    },
    {
      h: "9. Responsabilidad",
      p: [
        "Wayra responde por los daños que cause por dolo o culpa en la prestación del servicio. No responde por fallas de internet del Cliente, de SUNAT, de los OSE, de las pasarelas de pago u otros terceros, ni por el uso indebido de las credenciales del Cliente o su personal.",
        "Ante una interrupción imputable a Wayra que supere el objetivo de disponibilidad, el Cliente recibirá una compensación en su siguiente facturación proporcional al tiempo de interrupción. Esto no limita los derechos que la ley le reconoce.",
      ],
    },
    {
      h: "10. Suspensión y terminación",
      p: [
        "Wayra solo puede suspender o terminar el servicio por falta de pago (con el aviso de la cláusula 3), por uso ilícito o que ponga en riesgo la seguridad de otros clientes, o por mandato de autoridad. En los demás casos, avisará con 30 días de anticipación.",
        "Las partes pueden terminar el contrato en cualquier momento según la cláusula 4, sin penalidades.",
      ],
    },
    {
      h: "11. Cambios en estos términos",
      p: [
        "Si Wayra modifica estos términos, avisará por correo y dentro del sistema con al menos 30 días de anticipación y pedirá una nueva aceptación. Si el Cliente no acepta, puede cancelar sin penalidad antes de que entren en vigor.",
      ],
    },
    {
      h: "12. Reclamos, ley aplicable y controversias",
      p: [
        `Consultas y reclamos: ${E.emailSoporte}. Wayra cuenta con un Libro de Reclamaciones virtual y responde en un plazo máximo de 15 días hábiles.`,
        "Se aplica la ley peruana. Las controversias se intentarán resolver primero de forma directa; si no hay acuerdo, se someterán a los jueces de Lima Cercado, sin perjuicio de los derechos del Cliente ante el Indecopi cuando le corresponda la protección como consumidor.",
      ],
    },
  ],
};

const PRIVACIDAD: LegalDoc = {
  id: "privacidad",
  title: "Política de Privacidad",
  version: "2026-09",
  updated: UPDATED,
  acceptance: true,
  summary:
    "Qué datos trata Wayra de los dueños y el personal de los restaurantes, para qué, con quién los comparte, cuánto tiempo los guarda y cómo ejercer tus derechos.",
  sections: [
    {
      h: "1. Quién es responsable",
      p: [
        `${E.razonSocial} (RUC ${E.ruc}, domicilio en ${E.domicilio}) es responsable de los datos de las personas que usan Wayra POS en su calidad de clientes o de personal de un cliente. Contacto para privacidad: ${E.emailPrivacidad}.`,
        "Respecto de los datos de los comensales de cada restaurante (clientes, direcciones de delivery, reclamos), el responsable es el restaurante y Wayra actúa como encargado de tratamiento, según el Acuerdo de Encargo de Tratamiento de Datos.",
      ],
    },
    {
      h: "2. Qué datos tratamos",
      p: [
        "Del dueño o representante: nombre, correo, teléfono, datos de la empresa (RUC, razón social, dirección fiscal) y datos de facturación.",
        "Del personal del restaurante: nombre, rol y PIN de acceso (guardado cifrado, nunca en texto).",
        "Datos técnicos: registros de acceso, dispositivo y navegador, y errores del sistema, para seguridad y soporte.",
        "No tratamos datos sensibles ni almacenamos números completos de tarjeta: los cobros con tarjeta los procesa directamente la pasarela de pagos.",
      ],
    },
    {
      h: "3. Para qué los usamos",
      p: [
        "Prestar el servicio contratado (crear la cuenta, dar acceso, facturar la suscripción, brindar soporte) y cumplir obligaciones legales y tributarias. Estas finalidades no requieren consentimiento adicional porque son necesarias para el contrato o la ley.",
        "Enviar avisos del servicio (cambios, renovaciones, seguridad), que no se pueden desactivar mientras el contrato esté vigente.",
        "Con tu consentimiento, que puedes retirar en cualquier momento: enviarte novedades comerciales de Wayra.",
      ],
    },
    {
      h: "4. Con quién los compartimos",
      p: [
        "Solo con proveedores que necesitamos para prestar el servicio (alojamiento, base de datos, correo, facturación electrónica y pasarelas de pago), bajo contratos que les exigen confidencialidad y seguridad; y con autoridades cuando la ley lo exija.",
        "Algunos de estos proveedores están fuera del Perú (principalmente en Estados Unidos). Esto constituye un flujo transfronterizo de datos, que realizamos con proveedores que ofrecen garantías de protección adecuadas, conforme a la Ley 29733 y su reglamento. La lista de proveedores está en el Acuerdo de Encargo de Tratamiento.",
      ],
    },
    {
      h: "5. Cuánto tiempo los guardamos",
      p: [
        "Mientras la cuenta esté activa y hasta 60 días después de terminado el contrato. Los datos de facturación se conservan el plazo que exige la normativa tributaria. Los registros de acceso se conservan hasta 12 meses por seguridad.",
      ],
    },
    {
      h: "6. Seguridad",
      p: [
        "Aplicamos cifrado en tránsito, aislamiento de los datos de cada restaurante en la base de datos, control de acceso por roles, doble factor para el dueño, registro de cambios sensibles y copias de seguridad diarias.",
        "Si ocurre un incidente de seguridad que afecte tus datos, te lo comunicaremos a ti y, cuando corresponda, a la Autoridad Nacional de Protección de Datos Personales dentro de las 48 horas de conocerlo, con las medidas adoptadas.",
      ],
    },
    {
      h: "7. Tus derechos",
      p: [
        `Puedes pedir acceso, rectificación, cancelación u oposición al tratamiento de tus datos (derechos ARCO), así como su portabilidad en un formato estructurado, escribiendo a ${E.emailPrivacidad} con tu nombre y una copia de tu documento de identidad. Respondemos gratis y dentro de los plazos legales (en general, 20 días hábiles para acceso y 10 días hábiles para los demás derechos).`,
        "Si consideras que no atendimos tu solicitud, puedes presentar una reclamación ante la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.",
        "Si eres comensal de un restaurante que usa Wayra, dirige tu solicitud al restaurante; si nos escribes a nosotros, se la trasladaremos.",
      ],
    },
    {
      h: "8. Menores de edad",
      p: ["El servicio está dirigido a negocios. No recopilamos a sabiendas datos de menores de 14 años."],
    },
    {
      h: "9. Cambios en esta política",
      p: ["Publicaremos cualquier cambio en esta página con su fecha y, si es relevante, te avisaremos por correo y dentro del sistema."],
    },
  ],
};

const ENCARGO: LegalDoc = {
  id: "encargo",
  title: "Acuerdo de Encargo de Tratamiento de Datos Personales",
  version: "2026-09",
  updated: UPDATED,
  acceptance: true,
  summary:
    "El restaurante es responsable de los datos de sus comensales y trabajadores; Wayra solo los trata por su cuenta y según sus instrucciones. Este acuerdo fija esas reglas, como exige el Reglamento de la Ley 29733.",
  sections: [
    {
      h: "1. Roles",
      p: [
        "El Cliente (restaurante) es el titular del banco de datos y responsable del tratamiento de los datos personales de sus comensales, clientes de lealtad, destinatarios de delivery, consumidores que presentan reclamos y trabajadores que registre en el sistema.",
        `${E.razonSocial} actúa como encargado de tratamiento: trata esos datos únicamente para prestar el servicio Wayra POS y siguiendo las instrucciones del Cliente, que se expresan en la configuración y el uso del sistema.`,
      ],
    },
    {
      h: "2. Datos y finalidades",
      p: [
        "Datos: nombre, teléfono, correo, dirección y referencia de entrega, historial de consumo y puntos, documento de identidad y contenido de reclamos, datos del comprador en facturas, y nombre y rol del personal.",
        "Finalidades: tomar y entregar pedidos, emitir comprobantes, gestionar el programa de clientes, atender el Libro de Reclamaciones y operar el negocio. Wayra no usará estos datos para fines propios, no los venderá ni los cederá.",
      ],
    },
    {
      h: "3. Obligaciones de Wayra como encargado",
      p: [
        "Tratar los datos solo según las instrucciones del Cliente y avisarle si alguna instrucción le parece contraria a la ley.",
        "Guardar confidencialidad y exigirla a su personal y proveedores.",
        "Mantener medidas de seguridad adecuadas: aislamiento de datos por restaurante, cifrado en tránsito, control de acceso por roles, registro de cambios y copias de seguridad.",
        "Comunicar al Cliente, sin demora y a más tardar dentro de las 48 horas de conocerlo, cualquier incidente de seguridad que afecte sus datos, con la información disponible para que el Cliente cumpla sus propias obligaciones.",
        "Ayudar al Cliente a atender los derechos ARCO y de portabilidad de los titulares, poniendo a su disposición herramientas de consulta y exportación.",
        "Informar al Cliente los cambios en su política de privacidad y en la lista de subencargados, y permitir que el Cliente limite el tratamiento a lo necesario.",
        "Al terminar el contrato, devolver los datos (exportación) y eliminarlos a los 60 días, salvo que la ley exija conservarlos.",
      ],
    },
    {
      h: "4. Subencargados y flujo transfronterizo",
      p: [
        "El Cliente autoriza a Wayra a apoyarse en los siguientes proveedores, que tratan datos por cuenta de Wayra bajo obligaciones equivalentes a este acuerdo:",
        ...E.subencargados.map((s) => `${s.nombre} — ${s.servicio} (${s.pais}).`),
        "Wayra avisará con 30 días de anticipación si incorpora un subencargado nuevo; el Cliente podrá oponerse y, si no hay alternativa, terminar el contrato sin penalidad.",
        "Los proveedores ubicados fuera del Perú implican un flujo transfronterizo de datos, que se realiza con proveedores que ofrecen garantías de protección adecuadas conforme al Reglamento de la Ley 29733.",
      ],
    },
    {
      h: "5. Obligaciones del Cliente como responsable",
      p: [
        "Informar a sus comensales y trabajadores sobre el tratamiento de sus datos (puede usar el «Aviso de privacidad para comensales» que Wayra pone a su disposición), obtener su consentimiento cuando la ley lo requiera y atender sus derechos.",
        "Inscribir sus bancos de datos en el Registro Nacional de Protección de Datos Personales cuando corresponda (trámite gratuito y virtual) y designar a su oficial de datos personales si la ley se lo exige.",
        "Registrar en el sistema solo los datos necesarios para sus finalidades.",
      ],
    },
    {
      h: "6. Auditoría",
      p: [
        "A pedido del Cliente, Wayra entregará información sobre las medidas de seguridad aplicadas y responderá cuestionarios razonables de cumplimiento una vez al año, o cuando ocurra un incidente.",
      ],
    },
  ],
};

const COOKIES: LegalDoc = {
  id: "cookies",
  title: "Política de Cookies y Almacenamiento Local",
  version: "2026-09",
  updated: UPDATED,
  acceptance: false,
  summary:
    "Wayra POS solo usa almacenamiento técnico, necesario para que el sistema funcione (incluso sin internet). No usa cookies de publicidad ni de seguimiento.",
  sections: [
    {
      h: "1. Qué usamos",
      p: [
        "Almacenamiento técnico del navegador (localStorage e IndexedDB) para: mantener la sesión iniciada, recordar el tema, idioma y sucursal elegida, y guardar la cola de pedidos y cobros cuando no hay internet para enviarlos al reconectar.",
        "Estos datos se guardan en el propio equipo y son estrictamente necesarios para prestar el servicio que solicitas, por lo que no requieren consentimiento según la normativa de protección de datos.",
      ],
    },
    {
      h: "2. En el sitio web público",
      p: [
        `En la web informativa (${E.sitio}) usamos una cookie esencial para recordar tu elección y, solo si la aceptas en el aviso de cookies, analítica de uso agregada (Google Analytics con IP anonimizada). Puedes cambiar tu elección en cualquier momento con el botón «Preferencias de cookies» del pie de página.`,
      ],
    },
    {
      h: "3. Qué no usamos",
      p: ["No usamos cookies de publicidad, de perfiles ni de seguimiento entre sitios, ni en la web ni dentro del sistema."],
    },
    {
      h: "4. Cómo borrarlos",
      p: [
        "Puedes borrarlos desde la configuración de tu navegador. Ten en cuenta que, si borras los datos del sitio mientras hay operaciones pendientes de sincronizar, esas operaciones se perderán: antes, verifica en el indicador de conexión que no haya cambios en cola.",
      ],
    },
  ],
};

const COMENSALES: LegalDoc = {
  id: "comensales",
  title: "Aviso de Privacidad para Comensales",
  version: "2026-09",
  updated: UPDATED,
  acceptance: false,
  summary:
    "Aviso que cada restaurante muestra a sus clientes en la carta digital, el delivery y el Libro de Reclamaciones.",
  sections: [
    {
      h: "1. Quién trata tus datos",
      p: [
        "El restaurante donde compras es el responsable de tus datos personales. Usa el sistema Wayra POS, que los trata por su cuenta como encargado, solo para las finalidades de este aviso. Los datos del restaurante (razón social, RUC y dirección) figuran en tus comprobantes.",
      ],
    },
    {
      h: "2. Qué datos y para qué",
      p: [
        "Nombre y teléfono para tu pedido o reserva; dirección y referencia para el delivery; RUC o DNI si pides factura o boleta con tus datos; los datos de tu reclamo para atenderlo; y tu historial de compras si te inscribes en el programa de puntos.",
        "Se usan para preparar y entregar tu pedido, emitir tu comprobante ante SUNAT, atender reclamos y administrar tus puntos. No se usan para publicidad sin tu consentimiento ni se venden.",
        "El pago con tarjeta lo procesa la pasarela de pagos; el restaurante y Wayra no guardan el número de tu tarjeta.",
      ],
    },
    {
      h: "3. Cuánto tiempo",
      p: ["Los datos de pedidos y comprobantes se conservan el plazo que exige la normativa tributaria; los del programa de puntos, mientras sigas inscrito; los de reclamos, al menos dos años como exige el Libro de Reclamaciones."],
    },
    {
      h: "4. Tus derechos",
      p: [
        "Puedes pedir al restaurante el acceso, la rectificación, la cancelación o la oposición al tratamiento de tus datos, y su portabilidad. Si no te atienden, puedes acudir a la Autoridad Nacional de Protección de Datos Personales.",
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terminos: TERMINOS,
  privacidad: PRIVACIDAD,
  encargo: ENCARGO,
  cookies: COOKIES,
  comensales: COMENSALES,
};

/** Documentos que el dueño acepta al contratar (y de nuevo si cambian). */
export const ACCEPTANCE_DOCS = Object.values(LEGAL_DOCS).filter((d) => d.acceptance);

/** Versiones vigentes, p. ej. { terminos: "2026-09", ... }. */
export function currentVersions(): Record<string, string> {
  return Object.fromEntries(ACCEPTANCE_DOCS.map((d) => [d.id, d.version]));
}

/** Documentos cuya versión aceptada no es la vigente. */
export function pendingAcceptance(accepted: Record<string, string>): LegalDoc[] {
  return ACCEPTANCE_DOCS.filter((d) => accepted[d.id] !== d.version);
}
