/**
 * Funcoes puras e adaptadores pequenos do motor Brevo.
 * Este modulo nao le .env, nao acessa rede ao importar e pode ser testado isoladamente.
 */

const MAILBOX_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function resolveDailyCap(value, { defaultCap = 20, hardMax = 250 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultCap;
  return Math.min(parsed, hardMax);
}

export function resolveBatchLimit(value, { hardMax = 250 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, hardMax);
}

export function resolveEffectiveSentToday(centralCount, unloggedLocalCount = 0) {
  const safeCount = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  };
  return safeCount(centralCount) + safeCount(unloggedLocalCount);
}

function dayKeyInTimeZone(value, timeZone = "America/Sao_Paulo") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function countEmailSendsForDay(rows, now = new Date(), timeZone = "America/Sao_Paulo") {
  const targetDay = dayKeyInTimeZone(now, timeZone);
  if (!targetDay) return 0;
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => dayKeyInTimeZone(row?.created_at, timeZone) === targetDay,
  ).length;
}

export async function fetchCrmEmailSentToday({
  fetchFn = fetch,
  supabaseUrl,
  headers,
  now = new Date(),
  timeZone = "America/Sao_Paulo",
}) {
  const baseUrl = String(supabaseUrl || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("SUPABASE_URL ausente ou invalida para consultar o total diario.");
  }

  // A janela de 36h cobre integralmente o dia local mesmo perto da virada UTC.
  // Ordenar do mais novo e limitar em 1000 falha de forma conservadora: se houver
  // mais de 1000 envios recentes, o total contado ja excede qualquer teto permitido.
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "created_at",
    type: "eq.email_sent",
    created_at: `gte.${since}`,
    order: "created_at.desc",
    limit: "1000",
  });
  const response = await fetchFn(`${baseUrl}/rest/v1/activities?${params}`, {
    headers: { ...headers, accept: "application/json" },
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(`Falha ao consultar total diario no CRM (HTTP ${response.status}).`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Resposta invalida ao consultar total diario no CRM.");
  return countEmailSendsForDay(rows, now, timeZone);
}

export function recipientFromActivityDescription(description) {
  const match = /e-mail enviado para\s+([^\s:]+@[^\s:]+):/i.exec(String(description || ""));
  if (!match) return null;
  const mailbox = match[1].trim().toLowerCase();
  return MAILBOX_PATTERN.test(mailbox) ? mailbox : null;
}

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
