-- Story 020: metadados minimos para ingestao idempotente de WhatsApp via Uazapi.
-- Aditiva e repetivel. Nao armazena o payload bruto do provedor.

alter table public.messages
  add column if not exists provider text not null default 'manual',
  add column if not exists provider_message_id text,
  add column if not exists provider_instance_id text,
  add column if not exists chat_id text,
  add column if not exists direction text,
  add column if not exists sender_phone text,
  add column if not exists sender_name text,
  add column if not exists message_type text,
  add column if not exists occurred_at timestamptz,
  add column if not exists ai_insight text,
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_processed_at timestamptz;

create unique index if not exists messages_provider_message_uidx
  on public.messages (provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists messages_phone_occurred_idx
  on public.messages (sender_phone, occurred_at desc)
  where sender_phone is not null;

create table if not exists public.integration_settings (
  provider text primary key,
  webhook_secret_hash text not null,
  last_event_shape jsonb,
  last_event_reason text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;
drop policy if exists "Allow all" on public.integration_settings;

alter table public.integration_settings
  add column if not exists last_event_shape jsonb,
  add column if not exists last_event_reason text,
  add column if not exists last_event_at timestamptz;
