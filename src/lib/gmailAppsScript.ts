import type { NormalizedBrevoConversation } from "./brevoConversations.ts";
import { normalizeEmailAddress } from "./brevoConversations.ts";

type UnknownRecord = Record<string, unknown>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGES = 50;
const MAX_ID_LENGTH = 255;
const MAX_NAME_LENGTH = 200;
const MAX_SUBJECT_LENGTH = 500;
const MAX_CONTENT_LENGTH = 50_000;
const MAX_SOURCE_ID_LENGTH = 998;
const MAX_RECIPIENTS = 50;

function asRecord(value: unknown): UnknownRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function boundedString(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function requiredId(value: unknown, label: string): string {
  const id = boundedString(value, MAX_ID_LENGTH);
  if (!id) throw new Error(`${label} ausente no payload Gmail.`);
  return id;
}

function validEmail(value: unknown, label: string, required = false): string {
  const email = normalizeEmailAddress(value);
  if (!email && !required) return "";
  if (!EMAIL_PATTERN.test(email)) throw new Error(`${label} invalido no payload Gmail.`);
  return email;
}

function mailbox(value: unknown, label: string, required = false) {
  const record = asRecord(value);
  return {
    name: boundedString(record.name, MAX_NAME_LENGTH),
    email: validEmail(record.email, label, required),
  };
}

function mailboxList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_RECIPIENTS) throw new Error(`${label} excede 50 destinatarios.`);
  return value.map((entry, index) => mailbox(entry, `${label}[${index}]`, true).email);
}

function occurredAt(value: unknown): string {
  const date = typeof value === "number" ? new Date(value) : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new Error("Data invalida no payload Gmail.");
  return date.toISOString();
}

function messageDirection(value: unknown): "received" | "sent" {
  const direction = boundedString(value, 20);
  if (direction !== "received" && direction !== "sent") {
    throw new Error("Direcao invalida no payload Gmail.");
  }
  return direction;
}

export function normalizeGmailAppsScriptPayload(
  payload: unknown,
): NormalizedBrevoConversation | null {
  const envelope = asRecord(payload);
  if (boundedString(envelope.source, 50) !== "gmail_apps_script") return null;

  const thread = asRecord(envelope.thread);
  const providerThreadId = requiredId(thread.id, "Thread id");
  const participantEmail = validEmail(thread.participantEmail, "Email do participante", true);
  const participantName = boundedString(thread.participantName, MAX_NAME_LENGTH);
  const threadSubject = boundedString(thread.subject, MAX_SUBJECT_LENGTH) || "Sem assunto";

  if (!Array.isArray(envelope.messages) || envelope.messages.length === 0) {
    throw new Error("Payload Gmail sem mensagens.");
  }
  if (envelope.messages.length > MAX_MESSAGES) {
    throw new Error("Payload Gmail excede 50 mensagens.");
  }

  const messageIds = new Set<string>();
  const messages = envelope.messages.map((value, index) => {
    const message = asRecord(value);
    const providerMessageId = requiredId(message.id, `Mensagem ${index + 1}`);
    if (messageIds.has(providerMessageId)) {
      throw new Error("Payload Gmail possui ids de mensagem duplicados.");
    }
    messageIds.add(providerMessageId);

    const direction = messageDirection(message.direction);

    const from = mailbox(message.from, "Remetente", true);
    return {
      providerMessageId,
      direction,
      content: boundedString(message.text, MAX_CONTENT_LENGTH),
      htmlContent: "",
      subject: boundedString(message.subject, MAX_SUBJECT_LENGTH),
      fromEmail: from.email,
      recipientEmails: mailboxList(message.to, "Destinatarios"),
      ccEmails: mailboxList(message.cc, "Copias"),
      bccEmails: mailboxList(message.bcc, "Copias ocultas"),
      replyToEmail: validEmail(message.replyToEmail, "Reply-To"),
      sourceMessageId: boundedString(message.sourceMessageId, MAX_SOURCE_ID_LENGTH),
      senderName: from.name,
      occurredAt: occurredAt(message.occurredAt),
      attachments: [],
    };
  });

  return {
    thread: {
      providerThreadId,
      participantEmail,
      participantName: participantName || participantEmail,
      subject: threadSubject,
    },
    messages,
  };
}
