# Recorrido de usabilidad — primer uso (27/09/2026)

Recorrí la app como lo haría cada persona **la primera vez**, en escritorio
(1280 px) y celular (360–390 px), buscando dónde se traba o duda. Abajo, qué
encontré y qué se cambió. Las pruebas `e2e/primer-uso.spec.ts`,
`personal-sucursal.spec.ts`, `carta-inventario.spec.ts` y `responsive.spec.ts`
cubren estos recorridos.

## Dueño(a) del restaurante

| Hallazgo | Cambio |
| --- | --- |
| Al entrar caía en «Pedido» con «Elige una mesa»: nada le decía por dónde empezar. | Nueva portada **Inicio**: «Hola, Mónica», ventas de hoy, caja, comandas con retraso, insumos por reponer y **Primeros pasos** (datos y RUC → carta → mesas → personal → SUNAT → abrir caja → primera venta) que se marcan solos; el siguiente paso resaltado con «Empezar →». |
| 20 íconos sueltos en el menú, sin orden. | Menú agrupado en **Servicio / Caja y ventas / Gestión**, con títulos en el riel y en «Más» del celular. «Aprobaciones» sale del menú (se llega desde Inicio y Carta cuando hay cambios). |
| En escritorio (800 px de alto) «Caja», «Carta», «Inventario»… quedaban bajo el borde sin pista. | Indicador «▾ más» al pie del riel y botones más compactos. |
| «Personal» estaba escondido dentro de «Dueño»; cambiar un PIN usaba una ventana del navegador. | Pantalla propia **Personal**: qué puede hacer cada rol explicado al elegirlo, PIN con botón «Generar», «Quitar acceso» con confirmación. «Dueño» pasó a llamarse **Sucursales**. |
| **Se podían repetir PINs**: con dos personas en 1234, siempre entraba la primera. | Rechazado con «Ese PIN ya lo usa Ana Ruiz. Elige otro» (demo y producción). |
| Inicio, Cuentas, Reportes y el Excel **sumaban IGV encima** de precios que ya lo incluyen; «Ventas hoy» sumaba todo el histórico. | Corregido: totales = lo cobrado; IGV separado del total; ventas de hoy desde la medianoche. |
| Recetas: no se podía escribir «0.25» (el campo borraba el punto). | Corregido; además «✓ Guardado» al cambiar el precio de una sucursal. |
| Insumos con el mismo nombre se duplicaban. | Aviso «Ya existe un insumo llamado…». |
| Carta vacía en Pedido decía «sin resultados». | «La carta está vacía · Crear mi carta →» (al mesero: «pide al encargado…»). |
| El recorrido de bienvenida explicaba que la mesa se elige en «Pedido» (no es así). | Recorrido reescrito y por rol: Inicio (dueño/gerente), atender una mesa, cobrar y emitir, vender sin internet. |

## Mesero(a)

| Hallazgo | Cambio |
| --- | --- |
| Entraba a «Pedido» sin mesa. | Entra directo a **Mesas**. |
| Al tocar «＋» en un plato la única señal era un contador pequeño («1 ítems»). | Aviso «＋ Causa limeña», la tarjeta se marca con «×1» y el texto dice «1 ítem». |
| Recorrido de 5 pasos con pantallas de gestión que no usa. | Recorrido corto de 4 pasos solo con lo suyo. |

## Dueño del SaaS (tú)

| Hallazgo | Cambio |
| --- | --- |
| El alta de cliente no mostraba precios ni etiquetas (solo *placeholders*). | Etiquetas visibles y cada plan con su precio y límite de sucursales. |
| Un enlace de activación vencido mostraba una sola línea gris sin salida. | Página clara: qué pudo pasar, «Inicia sesión» y correo de soporte. |

## Lo que quedó bien y no se tocó

- Tomar un pedido y cobrar en celular: sin desbordes a 360 px, botones al alcance del pulgar.
- Caja (abrir → gasto → cobro → arqueo), inventario (compra → traslado) y carta (categoría → plato → receta → precio por sucursal) se completan sin ayuda en las pruebas e2e.
- Sin internet: el aviso 📶 y la cola funcionan igual que en línea.

## Pendientes sugeridos (no bloquean)

- Probar con 2–3 restaurantes reales (una tarde de servicio) y anotar dudas.
- Videos cortos de 30 s en Ayuda para: abrir caja, dividir cuenta, emitir factura.
