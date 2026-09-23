import { useParams, Link } from "react-router-dom";

const PRIVACIDAD = {
  title: "Política de Privacidad",
  body: [
    ["Responsable del tratamiento", "Wayra POS S.A.C. y el restaurante que opera el punto de venta tratan tus datos personales conforme a la Ley N° 29733 de Protección de Datos Personales y su reglamento."],
    ["Datos que recopilamos", "Datos de contacto (nombre, correo, teléfono), datos de consumo (pedidos, comprobantes) y, cuando aplique, datos de pago procesados por la pasarela (nunca almacenamos el número completo de tarjeta)."],
    ["Finalidad", "Emitir comprobantes electrónicos ante SUNAT, procesar pagos, gestionar el programa de lealtad, atender reclamos y mejorar el servicio."],
    ["Conservación", "Conservamos los datos el tiempo necesario para las finalidades descritas y los plazos legales tributarios."],
    ["Tus derechos (ARCO)", "Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo al correo de contacto del establecimiento."],
    ["Seguridad", "Aplicamos medidas técnicas y organizativas: cifrado en tránsito, control de acceso por roles y credenciales secretas de solo escritura."],
  ],
};

const TERMINOS = {
  title: "Términos y Condiciones",
  body: [
    ["Aceptación", "Al usar el sistema de pedidos, pagos y carta digital, aceptas estos términos y las políticas del establecimiento."],
    ["Uso del servicio", "El servicio permite realizar pedidos, pagos y recibir comprobantes electrónicos. El establecimiento es responsable de los productos y servicios ofrecidos."],
    ["Precios e impuestos", "Los precios incluyen IGV (18%) salvo indicación distinta. Los comprobantes se emiten conforme a la normativa de SUNAT."],
    ["Pagos", "Los pagos con tarjeta se procesan mediante pasarelas autorizadas (Culqi, Izipay, Niubiz). Yape/Plin se validan contra el número del establecimiento."],
    ["Reclamos", "Puedes registrar un reclamo o queja en el Libro de Reclamaciones digital del establecimiento."],
    ["Limitación de responsabilidad", "Wayra POS provee la plataforma tecnológica; la relación de consumo es entre el cliente y el establecimiento."],
  ],
};

export function Legal() {
  const { doc = "privacidad" } = useParams();
  const page = doc === "terminos" ? TERMINOS : PRIVACIDAD;
  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">{page.title}</h1>
        <p className="text-muted text-xs mb-5">Última actualización: {new Date().toLocaleDateString("es-PE")}</p>
        <div className="space-y-4">
          {page.body.map(([h, p]) => (
            <section key={h}>
              <h2 className="font-semibold">{h}</h2>
              <p className="text-muted text-sm">{p}</p>
            </section>
          ))}
        </div>
        <div className="mt-6 flex gap-3 text-sm">
          <Link className="underline text-accent" to="/legal/privacidad">
            Privacidad
          </Link>
          <Link className="underline text-accent" to="/legal/terminos">
            Términos
          </Link>
        </div>
      </div>
    </div>
  );
}
