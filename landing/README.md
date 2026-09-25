# Wayra POS — Landing (sitio de marketing)

Sitio **estático** (HTML/CSS/JS, sin build) para promocionar Wayra POS y captar
contactos. Se despliega en el dominio raíz (p. ej. `www.wayrapos.pe`), con la app
en `app.wayrapos.pe`.

## Qué incluye

- Página principal (`index.html`): hero, funciones, precios, beneficios, FAQ y
  formulario de contacto.
- **Legales**: `privacidad.html` (Ley 29733), `terminos.html` (Ley 29571),
  `cookies.html`.
- **Consentimiento de cookies** (`consent.js`): banner con aceptar / solo
  esenciales / configurar. La analítica **solo** se carga si el usuario acepta.
- **Accesibilidad**: HTML semántico, skip-link, foco visible, formularios con
  labels y validación por teclado (`form.js`), `aria-live`, contraste, soporte de
  `prefers-reduced-motion`.
- **SEO / indexado**: `<title>`/description, Open Graph, Twitter, canonical,
  JSON-LD (Organization, SoftwareApplication, FAQ), `robots.txt`, `sitemap.xml`.
- **Seguridad y MIME**: `_headers` (Netlify) y `vercel.json` con
  `X-Content-Type-Options: nosniff`, CSP, `X-Frame-Options`, y content-type de SVG.

## Configurar antes de publicar

1. **Dominio y URLs**: reemplaza `www.wayrapos.pe` y `app.wayrapos.pe` por tus
   dominios en `index.html`, los `*.html` legales, `sitemap.xml` y `robots.txt`.
2. **Datos del negocio**: razón social, RUC, dirección, correo y teléfono
   (footer de `index.html` y páginas legales).
3. **Formulario de contacto**: en `index.html`, cambia el `action` del formulario
   por la URL de tu Edge Function: `https://<PROJECT>.functions.supabase.co/contacto`.
   Sin configurar, el formulario cae a `mailto:` (sigue funcionando).
   - Despliega la función: `supabase functions deploy contacto`.
   - Aplica la migración `0025_contact_messages.sql` (ya incluida en `setup_all.sql`).
4. **Analítica** (opcional): en `consent.js`, pon tu ID de GA4 en `ANALYTICS_ID`
   (`G-XXXX`). Si lo dejas vacío, no se carga analítica.
5. **Libro de Reclamaciones**: enlaza tu Libro de Reclamaciones digital (obligatorio
   en Perú) en el footer.
6. **Imagen social**: agrega `img/og.png` (1200×630) para las tarjetas de OG/Twitter.
7. **Reseñas**: NO publiques testimonios falsos (Indecopi, Ley 29571). Agrega solo
   opiniones reales y verificables, con consentimiento del cliente.

## Desplegar

- **Vercel**: proyecto separado apuntando a la carpeta `landing/` (framework:
  "Other", sin build). `vercel.json` ya trae los headers.
- **Netlify**: publica la carpeta `landing/`; `_headers` se aplica solo.
- **Cualquier hosting estático**: sube el contenido de `landing/` a la raíz.
