import { createHash, timingSafeEqual } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export type UazapiMessage = {
  provider: "uazapi";
  providerMessageId: string;
  instanceId: string;
  chatId: string;
  contactPhone: string;
  senderName: string;
  direction: "sent" | "received";
  messageType: string;
  content: string;
  occurredAt: string;
};

export type UazapiNormalizationResult =
  | { kind: "message"; message: UazapiMessage }
  | {
      kind: "ignored";
      reason:
        | "unsupported_event"
        | "invalid_payload"
        | "group"
        | "sent_by_api"
        | "missing_message_id"
        | "missing_contact_phone";
    };

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  return false;
}

function phoneFromJid(value: unknown) {
  const beforeSuffix = asString(value).split("@")[0];
  return beforeSuffix.replace(/\D/g, "");
}

function toIsoTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString();
  const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return new Date(milliseconds).toISOString();
}

export function isValidWebhookSecret(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function hashWebhookSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function isValidWebhookSecretHash(provided: string | null, expectedHash: string | undefined) {
  if (!provided || !expectedHash) return false;

  const providedHash = Buffer.from(hashWebhookSecret(provided), "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (providedHash.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedHash, expectedBuffer);
}

export function normalizeUazapiWebhook(payload: unknown): UazapiNormalizationResult {
  const envelope = asRecord(payload);
  if (!envelope) return { kind: "ignored", reason: "invalid_payload" };

  const event = asString(envelope.event).toLowerCase();
  if (event !== "message" && event !== "messages") {
    return { kind: "ignored", reason: "unsupported_event" };
  }

  const data = asRecord(envelope.data);
  const message = asRecord(data?.message) ?? data;
  if (!message) return { kind: "ignored", reason: "invalid_payload" };

  const chatId = asString(message.chatid);
  if (asBoolean(message.isGroup) || chatId.endsWith("@g.us")) {
    return { kind: "ignored", reason: "group" };
  }
  if (asBoolean(message.wasSentByApi)) {
    return { kind: "ignored", reason: "sent_by_api" };
  }

  const providerMessageId = asString(message.messageid) || asString(message.id);
  if (!providerMessageId) {
    return { kind: "ignored", reason: "missing_message_id" };
  }

  const fromMe = asBoolean(message.fromMe);
  const contactPhone = fromMe
    ? phoneFromJid(chatId)
    : phoneFromJid(message.sender_pn) || phoneFromJid(message.sender) || phoneFromJid(chatId);
  if (!contactPhone) {
    return { kind: "ignored", reason: "missing_contact_phone" };
  }

  const messageType = asString(message.messageType) || "unknown";
  const text = asString(message.text);

  return {
    kind: "message",
    message: {
      provider: "uazapi",
      providerMessageId,
      instanceId: asString(envelope.instance),
      chatId,
      contactPhone,
      senderName: asString(message.senderName),
      direction: fromMe ? "sent" : "received",
      messageType,
      content: text || `[${messageType}]`,
      occurredAt: toIsoTimestamp(message.messageTimestamp),
    },
  };
}
