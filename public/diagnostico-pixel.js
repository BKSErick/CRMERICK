(function () {
  var DIAGNOSTICO_OSTRACK_EVENT = "DiagnosticoOStrackClick";

  // Paginas de diagnostico servidas fora do dominio do CRM apontam o endpoint
  // absoluto via <script src="..." data-endpoint="https://crm.../api/facebook-pixel">.
  var currentScript = document.currentScript;
  var ENDPOINT = (currentScript && currentScript.getAttribute("data-endpoint")) || "/api/facebook-pixel";
  var SAME_ORIGIN = ENDPOINT.indexOf("http") !== 0 || ENDPOINT.indexOf(window.location.origin) === 0;
  // Modelos de site (Lps) nao tem h1 com o nome do cliente: o nome vem explicito
  // via data-client-name para o agrupamento do radar de Sinais ficar correto.
  var CLIENT_NAME = currentScript && currentScript.getAttribute("data-client-name");

  function text(selector) {
    var el = document.querySelector(selector);
    return el ? (el.textContent || "").trim() : "";
  }

  // O GA4 server-side (Measurement Protocol) precisa do mesmo client_id do
  // browser, senao cada evento vira um usuario novo e nao junta com a sessao do
  // gtag. O cookie _ga e a fonte real; o localStorage cobre o primeiro pageview,
  // quando o gtag.js ainda nao gravou o cookie.
  function gaClientId() {
    var match = document.cookie.match(/_ga=GA\d+\.\d+\.(\d+\.\d+)/);
    if (match) return match[1];
    try {
      var stored = window.localStorage.getItem("crm_ga_cid");
      if (stored) return stored;
      var cid = Math.floor(Math.random() * 1e9) + "." + Math.floor(Date.now() / 1000);
      window.localStorage.setItem("crm_ga_cid", cid);
      return cid;
    } catch {
      return undefined;
    }
  }

  function track(eventName, extra) {
    var payload = Object.assign({
      eventName: eventName,
      pageUrl: window.location.href,
      clientName: CLIENT_NAME || text("h1") || document.title.replace(/^Analise Digital - /, ""),
      gaClientId: gaClientId(),
    }, extra || {});

    var sent = false;
    try {
      if (SAME_ORIGIN && navigator.sendBeacon) {
        sent = navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(payload)], { type: "application/json" }));
      }
    } catch {
      sent = false;
    }

    if (!sent) {
      // text/plain evita preflight CORS quando o endpoint e cross-origin.
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    }

    if (window.fbq) {
      window.fbq("trackCustom", eventName, {
        client_name: payload.clientName,
        button_name: payload.buttonName,
      });
      if (eventName === "DiagnosticoWhatsAppClick") {
        window.fbq("track", "Lead");
      }
    }
  }

  window.crmTrackDiagnostico = track;

  document.addEventListener("DOMContentLoaded", function () {
    track("DiagnosticoView");

    document.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        var href = link.getAttribute("href") || "";
        var label = (link.textContent || "").trim() || href;
        var explicitEvent = link.getAttribute("data-diagnostico-event");
        var eventName = explicitEvent === DIAGNOSTICO_OSTRACK_EVENT
          ? DIAGNOSTICO_OSTRACK_EVENT
          : explicitEvent || (href.indexOf("wa.me") !== -1 ? "DiagnosticoWhatsAppClick" : "DiagnosticoLinkClick");
        track(eventName, {
          buttonName: label.slice(0, 80),
        });
      });
    });
  });
})();
