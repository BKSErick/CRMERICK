import { createHash, timingSafeEqual } from "node:crypto";

type UnknownRecord = Record<string, unknown>;

export type EmailAttachment = {
  name: string;
  size: number | null;
  mimeType: string | null;
  link: string | null;
  isInline: boolean;
};

export type NormalizedBrevoEmailMessage = {
  providerMessageId: string;
  direction: "received" | "sent";
  content: string;
  htmlContent: string;
  subject: string;
  fromEmail: string;
  recipientEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  replyToEmail: string;
  sourceMessageId: string;
  senderName: string;
  occurredAt: string;
  attachments: EmailAttachment[];
};

export type NormalizedBrevoConversation = {
  thread: {
    providerThreadId: string;
    participantEmail: string;
    participantName: string;
    subject: string;
  };
  messages: NormalizedBrevoEmailMessage[];
};

function asRecord(value: unknown): UnknownRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeTimestamp(value: unknown): string {
  const milliseconds = typeof value === "number" ? value : Number(value);
  const date = new Date(milliseconds);
  return Number.isFinite(milliseconds) && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : new Date(0).toISOString();
}

export function normalizeEmailAddress(value: unknown): string {
  return asString(value).toLocaleLowerCase("pt-BR");
}

function mailbox(value: unknown): string {
  return normalizeEmailAddress(asRecord(value).email);
}

function mailboxList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(mailbox).filter(Boolean);
}

function safeLink(value: unknown): string | null {
  const link = asString(value);
  if (!link) return null;
  try {
    const parsed = new URL(link);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeAttachments(value: unknown): EmailAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const attachment = asRecord(entry);
    const rawSize = Number(attachment.size);
    return {
      name: asString(attachment.name),
      size: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : null,
      mimeType: asString(attachment.mimeType) || null,
      link: safeLink(attachment.link),
      isInline: attachment.isInline === true,
    };
  }).filter((attachment) => attachment.name || attachment.link);
}

function normalizeMessage(value: unknown, visitor: UnknownRecord): NormalizedBrevoEmailMessage | null {
  const message = asRecord(value);
  const providerMessageId = asString(message.id);
  if (!providerMessageId) return null;
  const from = asRecord(message.from);
  const replyTo = asRecord(message.replyTo);
  const direction = asString(message.type) === "agent" ? "sent" : "received";
  const visitorName = asString(visitor.displayedName);
  const attachmentValues = Array.isArray(message.attachments) ? [...message.attachments] : [];
  if (Object.keys(asRecord(message.file)).length > 0) attachmentValues.push(message.file);

  return {
    providerMessageId,
    direction,
    content: asString(message.text),
    htmlContent: asString(message.html),
    subject: asString(message.subject),
    fromEmail: mailbox(from),
    recipientEmails: mailboxList(message.to),
    ccEmails: mailboxList(message.cc),
    bccEmails: mailboxList(message.bcc),
    replyToEmail: mailbox(replyTo),
    sourceMessageId: asString(message.sourceMessageId),
    senderName: asString(from.name) || asString(message.agentName) || visitorName,
    occurredAt: safeTimestamp(message.createdAt),
    attachments: normalizeAttachments(attachmentValues),
  };
}

export function isValidBrevoWebhookSecret(provided: unknown, expected: unknown): boolean {
  const received = asString(provided);
  const configured = asString(expected);
  if (!received || !configured) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(receivedHash, configuredHash);
}

export function normalizeBrevoConversationEvent(payload: unknown): NormalizedBrevoConversation | null {
  const event = asRecord(payload);
  const eventName = asString(event.eventName);
  if (!eventName.startsWith("conversation")) return null;

  const providerThreadId = asString(event.conversationId);
  if (!providerThreadId) throw new Error("conversationId ausente no webhook Brevo.");

  const visitor = asRecord(event.visitor);
  const rawMessages = eventName === "conversationStarted"
    ? [event.message]
    : Array.isArray(event.messages) ? event.messages : [];
  const hasEmailShape = rawMessages.some((value) => {
    const message = asRecord(value);
    return Boolean(asString(message.subject) || mailbox(message.from) || mailboxList(message.to).length);
  });
  const source = asString(visitor.source).toLocaleLowerCase("pt-BR");
  if (source && source !== "email") return null;
  if (!source && !hasEmailShape) return null;

  const messages = rawMessages
    .map((message) => normalizeMessage(message, visitor))
    .filter((message): message is NormalizedBrevoEmailMessage => message != null);
  const visitorAttributes = asRecord(visitor.attributes);
  const received = messages.find((message) => message.direction === "received");
  const sent = messages.find((message) => message.direction === "sent");
  const participantEmail = normalizeEmailAddress(visitorAttributes.EMAIL)
    || received?.fromEmail
    || sent?.recipientEmails[0]
    || "";
  const subject = messages.find((message) => message.subject)?.subject || "Sem assunto";

  return {
    thread: {
      providerThreadId,
      participantEmail,
      participantName: asString(visitor.displayedName) || received?.senderName || participantEmail,
      subject,
    },
    messages,
  };
}
