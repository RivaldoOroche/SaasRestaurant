# Material comercial de Wayra POS

| PDF | Para qué sirve |
| --- | --- |
| `pdf/Wayra-POS-Presentacion.pdf` | Presentación de ventas (16:9) para mostrar en la visita o enviar por WhatsApp. |
| `pdf/Wayra-POS-Propuesta.pdf` | Propuesta comercial: qué es, beneficios, planes, preguntas frecuentes y guion de abordaje. |
| `pdf/Wayra-POS-Requisitos-Facturacion-y-Pagos.pdf` | Requisitos para configurar la facturación SUNAT/OSE y las pasarelas de pago. |

Las capturas de `img/` son pantallas reales del demo (`VITE_USE_MOCK=true`).

## Regenerar

```bash
# 1. Capturas (solo si cambió la app): con el demo corriendo en :5173
VITE_USE_MOCK=true npx vite --port 5173 &
node docs/comercial/capturas.mjs

# 2. PDF
node docs/comercial/generar-pdf.mjs
```

En entornos con Chromium preinstalado, antepón `PW_EXECUTABLE_PATH=/ruta/a/chromium`.
Los textos están en `propuesta.html`, `requisitos.html` y `presentacion.html`; los estilos de marca en `marca.css`.
