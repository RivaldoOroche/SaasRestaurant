/* Formulario de contacto accesible: validación por teclado, mensajes aria-live,
   envío por fetch al endpoint (Edge Function `contacto`) con fallback a mailto. */
(function () {
  "use strict";
  var form = document.getElementById("leadForm");
  if (!form) return;
  var status = document.getElementById("formStatus");
  var btn = document.getElementById("submitBtn");

  function setErr(id, msg) {
    var input = document.getElementById(id);
    var err = document.getElementById("err-" + id);
    if (err) err.textContent = msg || "";
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function validate() {
    var ok = true;
    var nombre = form.nombre.value.trim();
    var email = form.email.value.trim();
    ok = setErr("nombre", nombre ? "" : "Ingresa tu nombre.") && ok;
    ok = setErr("email", !email ? "Ingresa tu correo." : (emailOk(email) ? "" : "Correo no válido.")) && ok;
    var acepto = form.acepto.checked;
    var ea = document.getElementById("err-acepto");
    if (ea) ea.textContent = acepto ? "" : "Debes aceptar la política de privacidad.";
    ok = acepto && ok;
    if (!ok) {
      // Enfoca el primer campo con error (accesibilidad por teclado).
      var first = form.querySelector('[aria-invalid="true"]') || (!acepto ? form.acepto : null);
      if (first) first.focus();
    }
    return ok;
  }

  function show(kind, msg) {
    status.hidden = false;
    status.className = "form-status " + (kind === "ok" ? "ok" : "bad");
    status.textContent = msg;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;
    var endpoint = form.getAttribute("action") || "";
    var payload = {
      nombre: form.nombre.value.trim(),
      negocio: form.negocio.value.trim(),
      email: form.email.value.trim(),
      telefono: form.telefono.value.trim(),
      mensaje: form.mensaje.value.trim(),
      origen: "landing"
    };
    // Sin endpoint configurado → fallback a correo, sin romper la experiencia.
    if (!endpoint || endpoint.indexOf("TU-PROJECT") !== -1) {
      var body = encodeURIComponent(
        "Nombre: " + payload.nombre + "\nNegocio: " + payload.negocio +
        "\nCorreo: " + payload.email + "\nTeléfono: " + payload.telefono +
        "\n\n" + payload.mensaje
      );
      window.location.href = "mailto:hola@wayrapos.pe?subject=" +
        encodeURIComponent("Demo Wayra POS — " + payload.nombre) + "&body=" + body;
      show("ok", "Abrimos tu correo para enviarnos el mensaje. ¡Gracias!");
      return;
    }
    btn.disabled = true; btn.textContent = "Enviando…";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d && res.d.success !== false) {
          form.reset();
          show("ok", "¡Gracias! Te contactaremos el mismo día hábil.");
        } else {
          show("bad", (res.d && res.d.error) || "No pudimos enviar tu mensaje. Escríbenos a hola@wayrapos.pe.");
        }
      })
      .catch(function () { show("bad", "Sin conexión. Escríbenos a hola@wayrapos.pe."); })
      .finally(function () { btn.disabled = false; btn.textContent = "Solicitar demo"; });
  });

  // Limpia el error al escribir (feedback inmediato por teclado).
  ["nombre", "email"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", function () { setErr(id, ""); });
  });
})();
