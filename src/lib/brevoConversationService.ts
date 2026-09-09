import type {
  NormalizedBrevoConversation,
  NormalizedBrevoEmailMessage,
} from "./brevoConversations.ts";

export type CrmEmailLink = {
  contactId: number;
  dealId: number | null;
  company: string | null;
};

export type EnsureEmailThreadInput = NormalizedBrevoConversation["thread"] & {
  contactId: number | null;
  dealId: number | null;
};

export type InsertEmailMessageInput = NormalizedBrevoEmailMessage & {
  threadId: number;
  contactId: number | null;
  dealId: number | null;
};

export type InboundEmailActivityInput = {
  threadId: number;
  dealId: number;
  contactId: number | null;
  participantEmail: string;
  providerMessageId: string;
  subject: string;
  content: string;
  occurredAt: string;
};

export interface BrevoConversationRepository {
  findCrmLinkByEmail(email: string): Promise<CrmEmailLink | null>;
  ensureThread(input: EnsureEmailThreadInput): Promise<{ id: number }>;
  findExistingMessageIds(providerMessageIds: string[]): Promise<Set<string>>;
  insertMessage(input: InsertEmailMessageInput): Promise<boolean>;
  insertInboundActivity(input: InboundEmailActivityInput): Promise<void>;
  refreshThread(threadId: number): Promise<void>;
}

export async function ingestBrevoConversation(
  repository: BrevoConversationRepository,
  conversation: NormalizedBrevoConversation,
) {
  const link = conversation.thread.participantEmail
    ? await repository.findCrmLinkByEmail(conversation.thread.participantEmail)
    : null;
  const thread = await repository.ensureThread({
    ...conversation.thread,
    contactId: link?.contactId ?? null,
    dealId: link?.dealId ?? null,
  });
  const existingIds = await repository.findExistingMessageIds(
    conversation.messages.map((message) => message.providerMessageId),
  );

  let inserted = 0;
  let received = 0;
  let duplicates = existingIds.size;

  for (const message of conversation.messages) {
    if (existingIds.has(message.providerMessageId)) continue;
    const created = await repository.insertMessage({
      ...message,
      threadId: thread.id,
      contactId: link?.contactId ?? null,
      dealId: link?.dealId ?? null,
    });
    if (!created) {
      duplicates += 1;
      continue;
    }

    inserted += 1;
    if (message.direction === "received") {
      received += 1;
      if (link?.dealId) {
        await repository.insertInboundActivity({
          threadId: thread.id,
          dealId: link.dealId,
          contactId: link.contactId,
          participantEmail: conversation.thread.participantEmail,
          providerMessageId: message.providerMessageId,
          subject: message.subject || conversation.thread.subject,
          content: message.content,
          occurredAt: message.occurredAt,
        });
      }
    }
  }

  if (inserted > 0) await repository.refreshThread(thread.id);
  return { threadId: thread.id, inserted, received, duplicates };
}

export const ingestEmailConversation = ingestBrevoConversation;
