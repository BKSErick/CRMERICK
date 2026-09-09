begin;

create table if not exists public.email_threads (
  id bigserial primary key,
  provider text not null default 'brevo_conversations',
  provider_thread_id text not null,
  deal_id integer references public.deals(id) on delete set null,
  contact_id integer references public.contacts(id) on delete set null,
  participant_email text not null default '',
  participant_name text,
  subject text not null default 'Sem assunto',
  last_message_preview text not null default '',
  last_message_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  status text not null default 'open' check (status in ('open', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_thread_id)
);

alter table public.messages
  add column if not exists email_thread_id bigint references public.email_threads(id) on delete set null,
  add column if not exists subject text,
  add column if not exists from_email text,
  add column if not exists recipient_emails jsonb not null default '[]'::jsonb,
  add column if not exists cc_emails jsonb not null default '[]'::jsonb,
  add column if not exists bcc_emails jsonb not null default '[]'::jsonb,
  add column if not exists reply_to_email text,
  add column if not exists html_content text,
  add column if not exists source_message_id text,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

create index if not exists email_threads_last_message_idx
  on public.email_threads (last_message_at desc, id desc);
create index if not exists email_threads_participant_idx
  on public.email_threads (lower(participant_email));
create index if not exists email_threads_deal_idx
  on public.email_threads (deal_id) where deal_id is not null;
create index if not exists email_threads_contact_idx
  on public.email_threads (contact_id) where contact_id is not null;
create index if not exists messages_email_thread_occurred_idx
  on public.messages (email_thread_id, occurred_at asc, id asc);

comment on table public.email_threads is
  'Agrupamento de conversas de e-mail recebidas; messages permanece como fonte canonica do conteudo.';
comment on column public.messages.email_thread_id is
  'Thread de e-mail associada a mensagem recebida pelo provedor.';
comment on column public.messages.source_message_id is
  'Identificador original da mensagem informado pelo provedor de e-mail.';
comment on column public.messages.attachments is
  'Metadados seguros dos anexos; o CRM nao baixa os arquivos automaticamente.';

alter table public.email_threads enable row level security;
drop policy if exists "Allow all" on public.email_threads;

drop trigger if exists email_threads_updated_at on public.email_threads;
create trigger email_threads_updated_at
  before update on public.email_threads
  for each row execute function public.set_updated_at();

commit;
