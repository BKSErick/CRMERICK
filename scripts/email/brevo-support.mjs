/**
 * Funcoes puras e adaptadores pequenos do motor Brevo.
 * Este modulo nao le .env, nao acessa rede ao importar e pode ser testado isoladamente.
 */

const MAILBOX_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function validateMailbox(value) {
  const mailbox = String(value || "").trim();
  if (!MAILBOX_PATTERN.test(mailbox)) {
    throw new Error("E-mail de resposta invalido. Use endereco no formato nome@dominio.");
  }
  return mailbox;
}

export function contactForDeal(deal, contactsById) {
  const contactId = Number(deal?.contact_id);
  if (!Number.isInteger(contactId) || contactId <= 0) return null;
  return contactsById.get(contactId) || null;
}

const positiveIdOrNull = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export function buildActivityPayload(item, messageId, createdAt = new Date().toISOString()) {
  const email = validateMailbox(item?.email);
  const subject = String(item?.subject || "").trim();
  const dealId = positiveIdOrNull(item?.dealId);
  if (dealId == null) {
    throw new Error("Deal invalido na fila; atividade de e-mail nao pode nascer orfa.");
  }

  return {
    type: "email_sent",
    deal_id: dealId,
    contact_id: positiveIdOrNull(item?.contactId),
    description: `E-mail enviado para ${email}: ${subject}`,
    metadata: {
      provider: "brevo",
      message_id: String(messageId || "").trim() || null,
      classe: String(item?.classe || "").trim() || null,
    },
    created_at: createdAt,
  };
}

export function buildBrevoEmailPayload(sender, item, replyTo = "") {
  const senderEmail = validateMailbox(sender?.email);
  const replyEmail = replyTo ? validateMailbox(replyTo) : senderEmail;

  return {
    sender: { ...sender, email: senderEmail },
    to: [{ email: validateMailbox(item?.email), name: item?.company }],
    subject: item?.subject,
    htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${item?.html}
<p style="font-size:11px;color:#999;margin-top:20px">Se não quiser receber mais contato, responda com "sair" que eu removo.</p></div>`,
    replyTo: replyEmail === senderEmail ? { ...sender, email: senderEmail } : { email: replyEmail, name: sender?.name },
    tags: ["diagnostico-industrial", item?.semSite ? "sem-site" : "com-site"],
    headers: { "List-Unsubscribe": `<mailto:${replyEmail}?subject=unsubscribe>` },
  };
}

export function sentAtFromLogEntry(entry) {
  if (typeof entry === "string") return entry;
  return typeof entry?.sentAt === "string" ? entry.sentAt : "";
}

export async function postActivity({ fetchFn = fetch, supabaseUrl, headers, payload }) {
  const baseUrl = String(supabaseUrl || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("SUPABASE_URL ausente ou invalida para registrar atividade.");
  }
  const response = await fetchFn(`${baseUrl}/rest/v1/activities`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Consome o body para liberar a conexao, mas nao o inclui no erro porque a API
    // pode devolver snapshots de dados ou detalhes internos do schema.
    await response.text().catch(() => "");
    throw new Error(`Falha ao registrar atividades do CRM (HTTP ${response.status}).`);
  }
}
