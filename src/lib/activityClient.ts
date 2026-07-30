// Registra somente a abertura do WhatsApp. O envio real e confirmado exclusivamente
// pelo webhook Uazapi como whatsapp_sent_sync.

export async function logWhatsappOpened(dealId: number, description = "WhatsApp aberto") {
  try {
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, type: "whatsapp_opened", description }),
    });
  } catch {
    // silencioso de proposito: abrir o WhatsApp nao depende do log
  }
}
