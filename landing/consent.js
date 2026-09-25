/* Consentimiento de cookies + carga de analítica bajo consentimiento.
   Analítica solo se carga si el usuario acepta. Sin consentimiento, no se
   colocan cookies no esenciales. Configura tu ID en ANALYTICS_ID. */
(function () {
  "use strict";
  var KEY = "wayra-consent"; // "all" | "essential"
  var ANALYTICS_ID = ""; // <- pon aquí tu GA4 "G-XXXX" o déjalo vacío para no cargar analítica

  var $ = function (id) { return document.getElementById(id); };
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadAnalytics() {
    if (!ANALYTICS_ID || window.__wayraGA) return;
    window.__wayraGA = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + ANALYTICS_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    // IP anonimizada; sin cookies de publicidad.
    gtag("config", ANALYTICS_ID, { anonymize_ip: true });
  }

  function apply(consent) {
    if (consent === "all") loadAnalytics();
  }

  function hideBanner() { var b = $("cookieBanner"); if (b) b.classList.remove("show"); }
  function showBanner() { var b = $("cookieBanner"); if (b) b.classList.add("show"); }

  document.addEventListener("DOMContentLoaded", function () {
    var y = $("year"); if (y) y.textContent = new Date().getFullYear();

    // Menú móvil accesible
    var mb = $("menuBtn"), nl = $("navLinks");
    if (mb && nl) {
      mb.addEventListener("click", function () {
        var open = nl.classList.toggle("open");
        mb.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    var consent = get();
    if (consent) { apply(consent); } else { showBanner(); }

    function decide(v) { set(v); apply(v); hideBanner(); }
    if ($("ckAccept")) $("ckAccept").addEventListener("click", function () { decide("all"); });
    if ($("ckReject")) $("ckReject").addEventListener("click", function () { decide("essential"); });
    if ($("ckConfig")) $("ckConfig").addEventListener("click", function () {
      $("cookieOpts").classList.add("show");
      $("ckConfig").style.display = "none";
      $("ckSave").style.display = "";
    });
    if ($("ckSave")) $("ckSave").addEventListener("click", function () {
      decide($("ckAnalytics") && $("ckAnalytics").checked ? "all" : "essential");
    });
    // Reabrir preferencias desde el footer
    if ($("cookiePrefs")) $("cookiePrefs").addEventListener("click", function () {
      if ($("ckAnalytics")) $("ckAnalytics").checked = get() === "all";
      showBanner();
    });
  });
})();
