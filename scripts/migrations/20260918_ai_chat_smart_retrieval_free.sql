begin;

alter table public.ai_conversations
  add column if not exists model_preference jsonb not null default '{"mode":"auto"}'::jsonb;

alter table public.ai_conversation_messages
  add column if not exists usage jsonb,
  add column if not exists provider_attempts jsonb not null default '[]'::jsonb,
  add column if not exists routing_plan jsonb;

alter table public.email_threads
  add column if not exists last_message_direction text,
  add column if not exists last_message_id integer references public.messages(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ai_conversations_model_preference_object') then
    alter table public.ai_conversations add constraint ai_conversations_model_preference_object
      check (jsonb_typeof(model_preference) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_messages_usage_object') then
    alter table public.ai_conversation_messages add constraint ai_messages_usage_object
      check (usage is null or jsonb_typeof(usage) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_messages_provider_attempts_array') then
    alter table public.ai_conversation_messages add constraint ai_messages_provider_attempts_array
      check (jsonb_typeof(provider_attempts) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_messages_routing_plan_object') then
    alter table public.ai_conversation_messages add constraint ai_messages_routing_plan_object
      check (routing_plan is null or jsonb_typeof(routing_plan) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_threads_last_message_direction_check') then
    alter table public.email_threads add constraint email_threads_last_message_direction_check
      check (last_message_direction is null or last_message_direction in ('received', 'sent'));
  end if;
end $$;

update public.email_threads as thread
set last_message_id = (
      select message.id from public.messages as message
      where message.email_thread_id = thread.id
      order by message.occurred_at desc nulls last, message.id desc limit 1
    ),
    last_message_direction = (
      select message.direction from public.messages as message
      where message.email_thread_id = thread.id
      order by message.occurred_at desc nulls last, message.id desc limit 1
    );

create index if not exists email_threads_awaiting_reply_idx
  on public.email_threads (last_message_at desc, id desc)
  where status = 'open' and last_message_direction = 'received';

create index if not exists activities_whatsapp_timeline_idx
  on public.activities (created_at desc, id desc, deal_id)
  where deal_id is not null
    and type in ('whatsapp_received', 'whatsapp_sent', 'whatsapp_sent_sync');

alter table public.ai_conversations enable row level security;
alter table public.ai_conversation_messages enable row level security;
alter table public.email_threads enable row level security;
revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_conversation_messages from anon, authenticated;
revoke all on public.email_threads from anon, authenticated;

commit;
