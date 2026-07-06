(function () {
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
      if (navigator.sendBeacon) {
        sent = navigator.sendBeacon("/api/facebook-pixel", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      }
    } catch {
      sent = false;
    }

    if (!sent) {
      fetch("/api/facebook-pixel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        track(href.indexOf("wa.me") !== -1 ? "DiagnosticoWhatsAppClick" : "DiagnosticoLinkClick", {
          buttonName: label.slice(0, 80),
        });
      });
    });
  });
})();
