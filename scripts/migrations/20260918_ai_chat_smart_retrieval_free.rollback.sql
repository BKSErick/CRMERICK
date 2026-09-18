begin;

drop index if exists public.activities_whatsapp_timeline_idx;
drop index if exists public.email_threads_awaiting_reply_idx;

alter table public.email_threads
  drop column if exists last_message_id,
  drop column if exists last_message_direction;

alter table public.ai_conversation_messages
  drop column if exists routing_plan,
  drop column if exists provider_attempts,
  drop column if exists usage;

alter table public.ai_conversations
  drop column if exists model_preference;

commit;
