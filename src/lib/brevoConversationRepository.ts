import type { getCrmSupabaseAdmin } from "./crmSupabase";
import type {
  BrevoConversationRepository,
  EnsureEmailThreadInput,
  InboundEmailActivityInput,
  InsertEmailMessageInput,
} from "./brevoConversationService";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;

const BREVO_PROVIDER = "brevo_conversations";
const EMAIL_PROVIDERS = new Set([BREVO_PROVIDER, "gmail_apps_script"]);

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function compactPreview(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
}

export function createEmailConversationRepository(
  supabase: SupabaseAdmin,
  provider: string,
): BrevoConversationRepository {
  if (!EMAIL_PROVIDERS.has(provider)) throw new Error("Provedor de e-mail nao permitido.");

  async function loadThread(providerThreadId: string) {
    return supabase
      .from("email_threads")
      .select("id, deal_id, contact_id")
      .eq("provider", provider)
      .eq("provider_thread_id", providerThreadId)
      .maybeSingle();
  }

  return {
    async findCrmLinkByEmail(email) {
      const contacts = await supabase
        .from("contacts")
        .select("id, company")
        .ilike("email", email)
        .limit(2);
      if (contacts.error) throw contacts.error;
      if ((contacts.data ?? []).length !== 1) return null;

      const contact = contacts.data![0];
      const contactId = positiveInteger(contact.id);
      if (!contactId) return null;
      const deal = await supabase
        .from("deals")
        .select("id, company")
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (deal.error) throw deal.error;

      return {
        contactId,
        dealId: positiveInteger(deal.data?.id),
        company: String(deal.data?.company || contact.company || "").trim() || null,
      };
    },

    async ensureThread(input: EnsureEmailThreadInput) {
      const existing = await loadThread(input.providerThreadId);
      if (existing.error) throw existing.error;
      if (existing.data) {
        const updated = await supabase
          .from("email_threads")
          .update({
            participant_email: input.participantEmail,
            participant_name: input.participantName || null,
            subject: input.subject || "Sem assunto",
            contact_id: existing.data.contact_id ?? input.contactId,
            deal_id: existing.data.deal_id ?? input.dealId,
          })
          .eq("id", existing.data.id);
        if (updated.error) throw updated.error;
        return { id: Number(existing.data.id) };
      }

      const created = await supabase
        .from("email_threads")
        .insert({
          provider: provider,
          provider_thread_id: input.providerThreadId,
          participant_email: input.participantEmail,
          participant_name: input.participantName || null,
          subject: input.subject || "Sem assunto",
          contact_id: input.contactId,
          deal_id: input.dealId,
        })
        .select("id")
        .single();
      if (created.error?.code === "23505") {
        const raced = await loadThread(input.providerThreadId);
        if (raced.error || !raced.data) throw raced.error ?? new Error("Thread Brevo concorrente nao encontrada.");
        return { id: Number(raced.data.id) };
      }
      if (created.error) throw created.error;
      return { id: Number(created.data.id) };
    },

    async findExistingMessageIds(providerMessageIds) {
      if (providerMessageIds.length === 0) return new Set<string>();
      const existing = await supabase
        .from("messages")
        .select("provider_message_id")
        .eq("provider", provider)
        .in("provider_message_id", providerMessageIds);
      if (existing.error) throw existing.error;
      return new Set((existing.data ?? []).map((row) => String(row.provider_message_id)));
    },

    async insertMessage(input: InsertEmailMessageInput) {
      const created = await supabase.from("messages").insert({
        email_thread_id: input.threadId,
        deal_id: input.dealId,
        contact_id: input.contactId,
        channel: "email",
        content: input.content,
        status: input.direction === "received" ? "received" : "sent",
        sent_at: input.direction === "sent" ? input.occurredAt : null,
        provider: provider,
        provider_message_id: input.providerMessageId,
        direction: input.direction,
        sender_name: input.senderName || null,
        message_type: "email",
        occurred_at: input.occurredAt,
        subject: input.subject || null,
        from_email: input.fromEmail || null,
        recipient_emails: input.recipientEmails,
        cc_emails: input.ccEmails,
        bcc_emails: input.bccEmails,
        reply_to_email: input.replyToEmail || null,
        html_content: input.htmlContent || null,
        source_message_id: input.sourceMessageId || null,
        attachments: input.attachments,
      });
      if (created.error?.code === "23505") return false;
      if (created.error) throw created.error;
      return true;
    },

    async insertInboundActivity(input: InboundEmailActivityInput) {
      const activity = await supabase.from("activities").insert({
        deal_id: input.dealId,
        contact_id: input.contactId,
        type: "email_received",
        description: `E-mail recebido de ${input.participantEmail}: ${input.subject || "Sem assunto"}`,
        metadata: {
          provider: provider,
          provider_message_id: input.providerMessageId,
          email_thread_id: input.threadId,
          preview: compactPreview(input.content),
        },
        created_at: input.occurredAt,
      });
      if (activity.error) throw activity.error;
    },

    async refreshThread(threadId) {
      const [latest, unread] = await Promise.all([
        supabase
          .from("messages")
          .select("content, subject, occurred_at")
          .eq("email_thread_id", threadId)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("email_thread_id", threadId)
          .eq("direction", "received")
          .neq("status", "read"),
      ]);
      if (latest.error) throw latest.error;
      if (unread.error) throw unread.error;
      const updated = await supabase
        .from("email_threads")
        .update({
          last_message_preview: compactPreview(latest.data?.content),
          last_message_at: latest.data?.occurred_at ?? null,
          subject: String(latest.data?.subject || "").trim() || "Sem assunto",
          unread_count: unread.count ?? 0,
        })
        .eq("id", threadId);
      if (updated.error) throw updated.error;
    },
  };
}

export function createBrevoConversationRepository(
  supabase: SupabaseAdmin,
): BrevoConversationRepository {
  return createEmailConversationRepository(supabase, BREVO_PROVIDER);
}
