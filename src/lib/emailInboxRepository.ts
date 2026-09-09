import type { getCrmSupabaseAdmin } from "./crmSupabase";
import { inboxPageWindow, normalizeInboxQuery } from "./emailInbox";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;

type EmailThreadRow = {
  id: number;
  provider: string;
  provider_thread_id: string;
  deal_id: number | null;
  contact_id: number | null;
  participant_email: string;
  participant_name: string | null;
  subject: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
};

type DealContext = {
  id: number;
  name: string | null;
  company: string | null;
  stage: string | null;
};

type ContactContext = {
  id: number;
  name: string | null;
  company: string | null;
  email: string | null;
};

export type EmailThreadContext = EmailThreadRow & {
  deal: DealContext | null;
  contact: ContactContext | null;
};

export type EmailMessageRow = {
  id: number;
  direction: "received" | "sent" | null;
  sender_name: string | null;
  from_email: string | null;
  recipient_emails: string[] | null;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  reply_to_email: string | null;
  subject: string | null;
  content: string | null;
  occurred_at: string | null;
  status: string | null;
  attachments: Array<{ name?: string; link?: string; mimeType?: string; size?: number }> | null;
};

function positiveIds(values: Array<number | null>): number[] {
  return [...new Set(values.filter((value): value is number => Number.isInteger(value) && Number(value) > 0))];
}

async function loadContexts(supabase: SupabaseAdmin, rows: EmailThreadRow[]) {
  const dealIds = positiveIds(rows.map((row) => row.deal_id));
  const contactIds = positiveIds(rows.map((row) => row.contact_id));
  const [deals, contacts] = await Promise.all([
    dealIds.length
      ? supabase.from("deals").select("id, name, company, stage").in("id", dealIds)
      : Promise.resolve({ data: [] as DealContext[], error: null }),
    contactIds.length
      ? supabase.from("contacts").select("id, name, company, email").in("id", contactIds)
      : Promise.resolve({ data: [] as ContactContext[], error: null }),
  ]);
  if (deals.error) throw deals.error;
  if (contacts.error) throw contacts.error;

  const dealsById = new Map((deals.data ?? []).map((deal) => [Number(deal.id), deal as DealContext]));
  const contactsById = new Map((contacts.data ?? []).map((contact) => [Number(contact.id), contact as ContactContext]));

  return rows.map((row): EmailThreadContext => ({
    ...row,
    deal: row.deal_id ? dealsById.get(row.deal_id) ?? null : null,
    contact: row.contact_id ? contactsById.get(row.contact_id) ?? null : null,
  }));
}

export function createEmailInboxRepository(supabase: SupabaseAdmin) {
  return {
    async listEmailThreads(input: { page: number; query?: string; unreadOnly?: boolean }) {
      const window = inboxPageWindow(input.page);
      const query = normalizeInboxQuery(input.query);
      let request = supabase
        .from("email_threads")
        .select(
          "id, provider, provider_thread_id, deal_id, contact_id, participant_email, participant_name, subject, last_message_preview, last_message_at, unread_count, status",
          { count: "exact" },
        );

      if (query) {
        request = request.or(
          `participant_email.ilike.%${query}%,participant_name.ilike.%${query}%,subject.ilike.%${query}%,last_message_preview.ilike.%${query}%`,
        );
      }
      if (input.unreadOnly) request = request.gt("unread_count", 0);

      const result = await request
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(window.from, window.to);
      if (result.error) throw result.error;

      const rows = (result.data ?? []) as EmailThreadRow[];
      const items = await loadContexts(supabase, rows);
      const total = result.count ?? 0;
      const totalPages = Math.max(1, Math.ceil(total / window.pageSize));

      return {
        items,
        page: window.page,
        pageSize: window.pageSize,
        total,
        totalPages,
        start: total === 0 ? 0 : window.from + 1,
        end: total === 0 ? 0 : Math.min(window.to + 1, total),
      };
    },

    async getEmailThread(threadId: number) {
      const thread = await supabase
        .from("email_threads")
        .select(
          "id, provider, provider_thread_id, deal_id, contact_id, participant_email, participant_name, subject, last_message_preview, last_message_at, unread_count, status",
        )
        .eq("id", threadId)
        .maybeSingle();
      if (thread.error) throw thread.error;
      if (!thread.data) return null;

      const messages = await supabase
        .from("messages")
        .select(
          "id, direction, sender_name, from_email, recipient_emails, cc_emails, bcc_emails, reply_to_email, subject, content, occurred_at, status, attachments",
        )
        .eq("email_thread_id", threadId)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true });
      if (messages.error) throw messages.error;

      const [context] = await loadContexts(supabase, [thread.data as EmailThreadRow]);
      return {
        thread: context,
        messages: (messages.data ?? []) as EmailMessageRow[],
      };
    },

    async markThreadRead(threadId: number) {
      const messages = await supabase
        .from("messages")
        .update({ status: "read" })
        .eq("email_thread_id", threadId)
        .eq("direction", "received");
      if (messages.error) throw messages.error;

      const thread = await supabase
        .from("email_threads")
        .update({ unread_count: 0 })
        .eq("id", threadId)
        .select("id")
        .maybeSingle();
      if (thread.error) throw thread.error;
      return Boolean(thread.data);
    },
  };
}
