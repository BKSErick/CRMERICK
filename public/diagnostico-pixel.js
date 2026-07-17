(function () {
  var DIAGNOSTICO_OSTRACK_EVENT = "DiagnosticoOStrackClick";

  // Paginas de diagnostico servidas fora do dominio do CRM apontam o endpoint
  // absoluto via <script src="..." data-endpoint="https://crm.../api/facebook-pixel">.
  var currentScript = document.currentScript;
  var ENDPOINT = (currentScript && currentScript.getAttribute("data-endpoint")) || "/api/facebook-pixel";
  var SAME_ORIGIN = ENDPOINT.indexOf("http") !== 0 || ENDPOINT.indexOf(window.location.origin) === 0;

  function text(selector) {
    var el = document.querySelector(selector);
    return el ? (el.textContent || "").trim() : "";
  }

  function track(eventName, extra) {
    var payload = Object.assign({
      eventName: eventName,
      pageUrl: window.location.href,
      clientName: text("h1") || document.title.replace(/^Analise Digital - /, ""),
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
