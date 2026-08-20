create extension if not exists pgcrypto;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  title text not null default 'Nova conversa',
  default_agent_id text not null default 'crm-copilot',
  context_scope jsonb not null default '{"type":"all"}'::jsonb check (jsonb_typeof(context_scope) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  status text not null default 'complete' check (status in ('pending', 'complete', 'failed')),
  agent_id text,
  content text not null default '',
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  context_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(context_manifest) = 'array'),
  provider text,
  model text,
  prompt_version text,
  source_hash text,
  error text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_owner_updated_idx on public.ai_conversations(created_by, updated_at desc);
create index if not exists ai_messages_conversation_created_idx on public.ai_conversation_messages(conversation_id, created_at asc);

create or replace function public.touch_ai_conversation_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.ai_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_ai_messages_touch_conversation on public.ai_conversation_messages;
create trigger trg_ai_messages_touch_conversation after insert or update on public.ai_conversation_messages
for each row execute function public.touch_ai_conversation_updated_at();

alter table public.ai_conversations enable row level security;
alter table public.ai_conversation_messages enable row level security;
revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_conversation_messages from anon, authenticated;
