// Helper client-side para registrar o clique em "Enviar WhatsApp" como atividade real
// (activities.type = whatsapp_sent) via rota server-side. Best-effort: nunca bloqueia o
// disparo (o link wa.me abre normalmente mesmo se o log falhar). Story 016.

export async function logWhatsappSent(dealId: number, description = "Disparo de WhatsApp") {
  try {
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, type: "whatsapp_sent", description }),
    });
  } catch {
    // silencioso de proposito: o disparo manual nao pode depender do log
  }
}
