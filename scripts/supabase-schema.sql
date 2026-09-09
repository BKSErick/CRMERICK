/**
 * supabase-schema.sql
 * Rode isso no SQL Editor do Supabase (https://rezgkabwxxltpprpvdua.supabase.co)
 * ou via: supabase db push (se usar CLI com migration)
 */

-- ─────────────────────────────────────────────
-- DEALS (Kanban cards / pipeline)
-- ─────────────────────────────────────────────
create table if not exists public.deals (
  id            serial primary key,
  name          text not null,
  company       text,
  segment       text,
  value         numeric default 0,
  prob          numeric default 0,
  stage         text default 'prospect',   -- prospect | qualified | proposal | negotiation | won | lost
  owner         text,
  owner_name    text,
  close_date    text,
  tag           text,
  tag_type      text,
  ticket_id     text,
  points        integer default 0,
  priority      text,
  priority_source text not null default 'automatic' check (priority_source in ('automatic', 'manual')),
  progress      integer default 0,
  assignee      text,
  phone         text,
  whatsapp      text,
  analysis_url  text,
  copy_text     text,
  site_url      text,
  status        text default 'open',       -- open | won | lost
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  response_type text not null default 'sem_resposta',
  response_type_source text not null default 'automatic',
  next_action_at timestamptz,
  next_action_type text,
  next_action_note text,
  next_action_source text not null default 'automatic',
  stage_entered_at timestamptz default now(),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  response_time_minutes integer,
  copy_version text,
  copy_variant text check (copy_variant is null or copy_variant in ('A', 'B')),
  offer_version text,
  experiment_id text,
  deal_health_score integer check (deal_health_score is null or deal_health_score between 0 and 100),
  deal_health_classification text check (deal_health_classification is null or deal_health_classification in ('excelente', 'saudavel', 'atencao', 'em_risco', 'critico', 'ganho', 'perdido')),
  deal_health_confidence integer check (deal_health_confidence is null or deal_health_confidence between 0 and 100),
  deal_health_factors jsonb not null default '[]'::jsonb,
  deal_health_risks jsonb not null default '[]'::jsonb,
  deal_health_warnings jsonb not null default '[]'::jsonb,
  deal_health_recommended_action text,
  deal_health_calculated_at timestamptz,
  deal_health_fingerprint text,
  deal_health_rubric_version integer,
  qualification jsonb not null default '{}'::jsonb check (jsonb_typeof(qualification) = 'object'),
  qualification_revision integer not null default 0 check (qualification_revision >= 0)
);

-- ─────────────────────────────────────────────
-- CONTACTS
-- ─────────────────────────────────────────────
create table if not exists public.contacts (
  id          serial primary key,
  name        text not null,
  company     text,
  email       text default '—',
  phone       text default '—',
  whatsapp    text,
  status      text default 'lead',         -- lead | active | client | lost
  initials    text,
  owner       text,
  owner_name  text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- MESSAGES (histórico de disparo)
-- ─────────────────────────────────────────────
create table if not exists public.messages (
  id          serial primary key,
  deal_id     integer references public.deals(id) on delete set null,
  contact_id  integer references public.contacts(id),
  channel     text default 'whatsapp',     -- whatsapp | instagram | email
  content     text,
  status      text default 'draft',        -- draft | sent | read | replied | bounced
  sent_at     timestamptz,
  provider    text not null default 'manual',
  provider_message_id text,
  provider_instance_id text,
  chat_id     text,
  direction   text,
  sender_phone text,
  sender_name text,
  message_type text,
  occurred_at timestamptz,
  ai_insight  text,
  ai_provider text,
  ai_model    text,
  ai_processed_at timestamptz,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- ACTIVITIES (log de interações)
-- ─────────────────────────────────────────────
create table if not exists public.activities (
  id          serial primary key,
  deal_id     integer references public.deals(id) on delete set null,
  contact_id  integer references public.contacts(id),
  type        text,                         -- note | call | email | meeting | stage_change
  description text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz default now()
);

-- Agrupamento de mensagens de e-mail recebidas pelo Brevo Conversations.
-- `messages` continua sendo a fonte canonica do conteudo; esta tabela materializa
-- apenas a thread para busca, paginacao e estado de leitura.
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

-- Fonte unica de agenda e reunioes. Status detalhado permite medir o fundo do funil.
create table if not exists public.calendar_events (
  id bigint generated always as identity primary key,
  title text not null,
  kind text not null default 'compromisso',
  starts_at timestamptz not null,
  ends_at timestamptz,
  deal_id integer references public.deals(id) on delete set null,
  contact_id integer references public.contacts(id) on delete set null,
  location text,
  notes text,
  done boolean not null default false,
  meeting_status text,
  confirmed_at timestamptz,
  held_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calendar_events_meeting_status_check check (
    (kind = 'reuniao' and meeting_status in ('scheduled', 'confirmed', 'held', 'no_show', 'cancelled'))
    or (kind <> 'reuniao' and meeting_status is null)
  )
);

-- Mantem o arquivo aplicavel em bancos criados antes da Story 025.
alter table public.deals
  add column if not exists priority text,
  add column if not exists priority_source text not null default 'automatic',
  add column if not exists stage_entered_at timestamptz,
  add column if not exists copy_version text,
  add column if not exists copy_variant text,
  add column if not exists offer_version text,
  add column if not exists experiment_id text,
  add column if not exists deal_health_score integer,
  add column if not exists deal_health_classification text,
  add column if not exists deal_health_confidence integer,
  add column if not exists deal_health_factors jsonb not null default '[]'::jsonb,
  add column if not exists deal_health_risks jsonb not null default '[]'::jsonb,
  add column if not exists deal_health_warnings jsonb not null default '[]'::jsonb,
  add column if not exists deal_health_recommended_action text,
  add column if not exists deal_health_calculated_at timestamptz,
  add column if not exists deal_health_fingerprint text,
  add column if not exists deal_health_rubric_version integer,
  add column if not exists qualification jsonb not null default '{}'::jsonb,
  add column if not exists qualification_revision integer not null default 0;
alter table public.activities add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.calendar_events
  add column if not exists meeting_status text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists held_at timestamptz;

update public.deals
set priority_source = 'manual'
where nullif(trim(priority), '') is not null and priority_source = 'automatic';

update public.deals
set stage_entered_at = coalesce(stage_entered_at, updated_at, created_at, now())
where stage_entered_at is null;

alter table public.deals alter column stage_entered_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_priority_source_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_priority_source_check
      check (priority_source in ('automatic', 'manual'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_health_score_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_health_score_check
      check (deal_health_score is null or deal_health_score between 0 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_health_confidence_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_health_confidence_check
      check (deal_health_confidence is null or deal_health_confidence between 0 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_health_classification_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_health_classification_check
      check (deal_health_classification is null or deal_health_classification in ('excelente', 'saudavel', 'atencao', 'em_risco', 'critico', 'ganho', 'perdido'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_qualification_object_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_qualification_object_check
      check (jsonb_typeof(qualification) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_qualification_revision_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_qualification_revision_check
      check (qualification_revision >= 0);
  end if;
end $$;

-- Estado operacional por oportunidade + canal. O deal continua unico no pipeline;
-- os relogios de WhatsApp, Instagram, email e LinkedIn nao se contaminam.
create table if not exists public.prospecting_channels (
  id bigserial primary key,
  deal_id integer not null references public.deals(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'whatsapp', 'email', 'linkedin')),
  identity text,
  profile_url text,
  match_source text,
  match_confidence text not null default 'low',
  status text not null default 'review',
  last_opened_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  next_action_at timestamptz,
  next_action_type text,
  next_action_note text,
  response_type text not null default 'sem_resposta',
  response_type_source text not null default 'automatic',
  opted_out_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, channel)
);

-- Motor central de automacao comercial (Story 027).
create table if not exists public.commercial_events (
  id bigserial primary key,
  external_key text not null unique,
  contract_version integer not null default 1 check (contract_version > 0),
  event_type text not null check (event_type in ('message.received', 'message.sent', 'deal.stage_changed', 'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed', 'deal.qualification_updated')),
  deal_id integer references public.deals(id) on delete set null,
  source text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.commercial_automation_rules (
  id text primary key,
  name text not null,
  description text not null default '',
  version integer not null default 1 check (version > 0),
  event_type text not null check (event_type in ('message.received', 'message.sent', 'deal.stage_changed', 'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed', 'deal.qualification_updated')),
  conditions jsonb not null default '[]'::jsonb,
  action_type text not null check (action_type in ('task.upsert', 'priority.set', 'draft.create', 'alert.create', 'confirmation.request')),
  action_payload jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_automation_runs (
  id bigserial primary key,
  event_id bigint not null references public.commercial_events(id) on delete cascade,
  execution_key text not null unique,
  deal_id integer references public.deals(id) on delete set null,
  rule_id text not null references public.commercial_automation_rules(id) on delete restrict,
  rule_version integer not null,
  event_type text not null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('planned', 'applied', 'awaiting_confirmation', 'skipped', 'failed')),
  reason text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- RLS: Habilita Row-Level Security
-- ─────────────────────────────────────────────
alter table public.deals      enable row level security;
alter table public.contacts   enable row level security;
alter table public.messages   enable row level security;
alter table public.activities enable row level security;
alter table public.email_threads enable row level security;
alter table public.calendar_events enable row level security;
alter table public.prospecting_channels enable row level security;
alter table public.commercial_events enable row level security;
alter table public.commercial_automation_rules enable row level security;
alter table public.commercial_automation_runs enable row level security;

-- Deny-by-default para anon/public.
-- As rotas Next.js usam service-role server-side e bypassam RLS sem expor segredo ao cliente.
drop policy if exists "Allow all" on public.deals;
drop policy if exists "Allow all" on public.contacts;
drop policy if exists "Allow all" on public.messages;
drop policy if exists "Allow all" on public.activities;
drop policy if exists "Allow all" on public.calendar_events;
drop policy if exists "Allow all" on public.prospecting_channels;
drop policy if exists "Allow all" on public.commercial_events;
drop policy if exists "Allow all" on public.commercial_automation_rules;
drop policy if exists "Allow all" on public.email_threads;
drop policy if exists "Allow all" on public.commercial_automation_runs;

-- ─────────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger commercial_automation_rules_updated_at
  before update on public.commercial_automation_rules
  for each row execute function public.set_updated_at();

create trigger email_threads_updated_at
  before update on public.email_threads
  for each row execute function public.set_updated_at();

insert into public.commercial_automation_rules
  (id, name, description, version, event_type, conditions, action_type, action_payload, enabled)
values
  ('inbound-next-action-v1', 'Proxima acao apos resposta', 'Cria tarefa segura a partir de uma mensagem recebida.', 1, 'message.received', '[{"field":"event.payload.suggestedTask.at","operator":"exists"}]'::jsonb, 'task.upsert', '{"nextActionAt":"$event.payload.suggestedTask.at","nextActionType":"$event.payload.suggestedTask.type","note":"$event.payload.suggestedTask.note"}'::jsonb, true),
  ('outbound-next-action-v1', 'Proxima acao apos envio', 'Agenda o follow-up sem enviar mensagem automaticamente.', 1, 'message.sent', '[{"field":"event.payload.suggestedTask.at","operator":"exists"}]'::jsonb, 'task.upsert', '{"nextActionAt":"$event.payload.suggestedTask.at","nextActionType":"$event.payload.suggestedTask.type","note":"$event.payload.suggestedTask.note"}'::jsonb, true),
  ('won-stage-alert-v1', 'Alerta de oportunidade ganha', 'Destaca a mudanca manual para a etapa ganha.', 1, 'deal.stage_changed', '[{"field":"event.payload.stage","operator":"equals","value":"won"}]'::jsonb, 'alert.create', '{"message":"Oportunidade marcada como ganha. Confira o fechamento."}'::jsonb, true),
  ('hot-score-priority-v1', 'Prioridade para lead quente', 'Sugere prioridade alta quando o score chega a 60.', 1, 'deal.score_updated', '[{"field":"event.payload.score","operator":"gte","value":60}]'::jsonb, 'priority.set', '{"priority":"Alta"}'::jsonb, true),
  ('due-next-action-alert-v1', 'Alerta de proxima acao vencida', 'Exibe no Comando uma proxima acao vencida.', 1, 'deal.next_action_due', '[]'::jsonb, 'alert.create', '{"message":"Proxima acao comercial vencida."}'::jsonb, true),
  ('held-meeting-confirmation-v1', 'Confirmar resultado da reuniao', 'Pede confirmacao humana apos uma reuniao realizada.', 1, 'meeting.status_changed', '[{"field":"event.payload.status","operator":"equals","value":"held"}]'::jsonb, 'confirmation.request', '{"message":"Reuniao realizada. Confirme o resultado e a proxima acao."}'::jsonb, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  version = excluded.version,
  event_type = excluded.event_type,
  conditions = excluded.conditions,
  action_type = excluded.action_type,
  action_payload = excluded.action_payload,
  updated_at = now();

-- ─────────────────────────────────────────────
-- INDEXES para performance
-- ─────────────────────────────────────────────
create index if not exists idx_deals_stage    on public.deals(stage);
create index if not exists commercial_events_deal_occurred_idx on public.commercial_events (deal_id, occurred_at desc);
create index if not exists commercial_rules_event_enabled_idx on public.commercial_automation_rules (event_type, enabled);
create index if not exists commercial_runs_deal_created_idx on public.commercial_automation_runs (deal_id, created_at desc);
create index if not exists commercial_runs_status_created_idx on public.commercial_automation_runs (status, created_at desc);
create index if not exists deals_health_active_risk_idx on public.deals (deal_health_score, deal_health_calculated_at) where stage not in ('won', 'lost');
create index if not exists idx_deals_owner    on public.deals(owner);
create index if not exists deals_next_action_at_idx on public.deals(next_action_at)
  where next_action_at is not null;
create index if not exists deals_response_type_idx on public.deals(response_type);
create index if not exists deals_experiment_variant_idx on public.deals(experiment_id, copy_variant)
  where experiment_id is not null;
create index if not exists idx_contacts_status on public.contacts(status);
create index if not exists idx_messages_deal  on public.messages(deal_id);
create index if not exists idx_messages_status on public.messages(status);
create index if not exists calendar_events_meeting_status_idx on public.calendar_events(meeting_status, starts_at)
  where kind = 'reuniao';
create unique index if not exists messages_provider_message_uidx
  on public.messages(provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists messages_phone_occurred_idx
  on public.messages(sender_phone, occurred_at desc)
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

-- QUIZ LEADS (captura do funil -> pipeline)
create table if not exists public.quiz_leads (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  quiz_id text,
  source text default 'quiz',
  name text,
  email text,
  phone text,
  whatsapp text,
  score numeric,
  gargalo text,
  segment text,
  gargalo_primario text,
  intencao text,
  dor_score numeric,
  equipe_porte text,
  faturamento text,
  answers jsonb,
  raw_payload jsonb,
  materialized_deal_id bigint references public.deals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quiz_leads_created_at_idx on public.quiz_leads (created_at desc);
create index if not exists quiz_leads_phone_idx on public.quiz_leads (phone) where phone is not null;
create index if not exists quiz_leads_email_idx on public.quiz_leads (email) where email is not null;
create index if not exists quiz_leads_external_id_idx on public.quiz_leads (external_id) where external_id is not null;
create index if not exists quiz_leads_materialized_deal_id_idx on public.quiz_leads (materialized_deal_id) where materialized_deal_id is not null;

alter table public.quiz_leads enable row level security;

drop policy if exists "Allow all" on public.quiz_leads;
drop policy if exists "quiz_leads_anon_insert" on public.quiz_leads;

create policy "quiz_leads_anon_insert" on public.quiz_leads
  for insert
  to anon
  with check (true);

-- ────────────────────────────────────────────────────────────────────────────
-- STORY 031: RAZOES DE PERDA E HISTORICO AUDITAVEL
-- ────────────────────────────────────────────────────────────────────────────
-- Story 031: razoes de perda estruturadas e historico imutavel.
-- Nenhum deal legado e classificado ou alterado por esta migration.

alter table public.deals
  add column if not exists loss_reason_code text,
  add column if not exists loss_reason_note text,
  add column if not exists loss_recorded_at timestamptz,
  add column if not exists loss_recorded_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_loss_reason_code_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_loss_reason_code_check check (
      loss_reason_code is null or loss_reason_code in (
        'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
        'bad_timing', 'competitor', 'bad_offer', 'no_fit',
        'invalid_channel_data', 'other'
      )
    );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_loss_other_note_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_loss_other_note_check check (
      loss_reason_code <> 'other' or nullif(trim(loss_reason_note), '') is not null
    );
  end if;
end $$;

create table if not exists public.deal_loss_records (
  id bigint generated always as identity primary key,
  deal_id integer references public.deals(id) on delete set null,
  episode_id uuid not null default gen_random_uuid(),
  reason_code text not null check (reason_code in (
    'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
    'bad_timing', 'competitor', 'bad_offer', 'no_fit',
    'invalid_channel_data', 'other'
  )),
  note text,
  previous_stage text not null,
  company_snapshot text,
  segment_snapshot text,
  origin_snapshot text,
  value_snapshot numeric,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by text,
  superseded_reason text check (superseded_reason is null or superseded_reason in ('corrected', 'reopened')),
  supersedes_id bigint references public.deal_loss_records(id) on delete set null,
  constraint deal_loss_records_other_note_check check (
    reason_code <> 'other' or nullif(trim(note), '') is not null
  )
);

create unique index if not exists deal_loss_records_one_active_idx
  on public.deal_loss_records(deal_id)
  where deal_id is not null and superseded_at is null;
create index if not exists deal_loss_records_period_idx
  on public.deal_loss_records(recorded_at desc, reason_code);
create index if not exists deal_loss_records_episode_idx
  on public.deal_loss_records(episode_id, recorded_at desc);

alter table public.deal_loss_records enable row level security;
drop policy if exists "Allow all" on public.deal_loss_records;
revoke all on table public.deal_loss_records from public, anon, authenticated;

create or replace function public.transition_deal_stage_atomic(
  p_deal_id bigint,
  p_target_stage text,
  p_reason_code text default null,
  p_reason_note text default null,
  p_actor text default null
)
returns public.deals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals%rowtype;
  v_record public.deal_loss_records%rowtype;
  v_now timestamptz := now();
begin
  if p_deal_id is null or p_deal_id <= 0 then
    raise exception 'Deal invalido.';
  end if;
  if p_target_stage is null or not (p_target_stage = any(array[
    'prospect', 'abordado', 'followup', 'qualified', 'proposal',
    'negotiation', 'won', 'lost'
  ])) then
    raise exception 'Etapa de destino invalida.';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Autoria da transicao e obrigatoria.';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;
  if not found then
    raise exception 'Deal % nao encontrado.', p_deal_id;
  end if;
  if v_deal.stage = p_target_stage then
    return v_deal;
  end if;

  if p_target_stage = 'lost' then
    if p_reason_code is null or not (p_reason_code = any(array[
      'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
      'bad_timing', 'competitor', 'bad_offer', 'no_fit',
      'invalid_channel_data', 'other'
    ])) then
      raise exception 'Razao de perda invalida.';
    end if;
    if p_reason_code = 'other' and nullif(trim(p_reason_note), '') is null then
      raise exception 'Nota e obrigatoria para a razao Outro.';
    end if;

    insert into public.deal_loss_records (
      deal_id, reason_code, note, previous_stage, company_snapshot,
      segment_snapshot, origin_snapshot, value_snapshot, recorded_by, recorded_at
    ) values (
      v_deal.id, p_reason_code, nullif(trim(p_reason_note), ''), v_deal.stage,
      coalesce(v_deal.company, v_deal.name), v_deal.segment, v_deal.origin,
      v_deal.value, trim(p_actor), v_now
    )
    returning * into v_record;

    update public.deals
    set stage = 'lost',
        stage_entered_at = v_now,
        loss_reason_code = p_reason_code,
        loss_reason_note = nullif(trim(p_reason_note), ''),
        loss_recorded_at = v_now,
        loss_recorded_by = trim(p_actor)
    where id = v_deal.id;

    insert into public.activities (deal_id, type, description, metadata, created_at)
    values
      (v_deal.id, 'stage_change', 'Movido para Lost', jsonb_build_object(
        'previous_stage', v_deal.stage, 'stage', 'lost', 'atomic', true
      ), v_now),
      (v_deal.id, 'deal_lost', 'Perda registrada: ' || p_reason_code, jsonb_build_object(
        'loss_record_id', v_record.id, 'episode_id', v_record.episode_id,
        'reason_code', p_reason_code, 'note', nullif(trim(p_reason_note), ''),
        'actor', trim(p_actor)
      ), v_now);

  elsif v_deal.stage = 'lost' then
    select * into v_record
    from public.deal_loss_records
    where deal_id = v_deal.id and superseded_at is null
    order by recorded_at desc, id desc
    limit 1
    for update;

    if found then
      update public.deal_loss_records
      set superseded_at = v_now,
          superseded_by = trim(p_actor),
          superseded_reason = 'reopened'
      where id = v_record.id;
    end if;

    update public.deals
    set stage = p_target_stage,
        stage_entered_at = v_now,
        loss_reason_code = null,
        loss_reason_note = null,
        loss_recorded_at = null,
        loss_recorded_by = null
    where id = v_deal.id;

    insert into public.activities (deal_id, type, description, metadata, created_at)
    values
      (v_deal.id, 'stage_change', 'Movido para ' || p_target_stage, jsonb_build_object(
        'previous_stage', 'lost', 'stage', p_target_stage, 'atomic', true
      ), v_now),
      (v_deal.id, 'deal_reopened', 'Negocio reaberto em ' || p_target_stage, jsonb_build_object(
        'loss_record_id', v_record.id, 'episode_id', v_record.episode_id,
        'actor', trim(p_actor)
      ), v_now);
  else
    update public.deals
    set stage = p_target_stage,
        stage_entered_at = v_now
    where id = v_deal.id;

    insert into public.activities (deal_id, type, description, metadata, created_at)
    values (v_deal.id, 'stage_change', 'Movido para ' || p_target_stage, jsonb_build_object(
      'previous_stage', v_deal.stage, 'stage', p_target_stage, 'atomic', true
    ), v_now);
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  return v_deal;
end;
$$;

create or replace function public.correct_deal_loss_reason_atomic(
  p_deal_id bigint,
  p_reason_code text,
  p_reason_note text default null,
  p_actor text default null
)
returns public.deals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals%rowtype;
  v_previous public.deal_loss_records%rowtype;
  v_current public.deal_loss_records%rowtype;
  v_now timestamptz := now();
begin
  if p_deal_id is null or p_deal_id <= 0 then
    raise exception 'Deal invalido.';
  end if;
  if p_reason_code is null or not (p_reason_code = any(array[
    'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
    'bad_timing', 'competitor', 'bad_offer', 'no_fit',
    'invalid_channel_data', 'other'
  ])) then
    raise exception 'Razao de perda invalida.';
  end if;
  if p_reason_code = 'other' and nullif(trim(p_reason_note), '') is null then
    raise exception 'Nota e obrigatoria para a razao Outro.';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Autoria da correcao e obrigatoria.';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;
  if not found then
    raise exception 'Deal % nao encontrado.', p_deal_id;
  end if;
  if v_deal.stage <> 'lost' then
    raise exception 'Somente deals em lost aceitam correcao do motivo.';
  end if;

  select * into v_previous
  from public.deal_loss_records
  where deal_id = v_deal.id and superseded_at is null
  order by recorded_at desc, id desc
  limit 1
  for update;
  if not found then
    raise exception 'Deal legado sem registro auditavel; reabra e registre uma nova perda.';
  end if;

  update public.deal_loss_records
  set superseded_at = v_now,
      superseded_by = trim(p_actor),
      superseded_reason = 'corrected'
  where id = v_previous.id;

  insert into public.deal_loss_records (
    deal_id, episode_id, reason_code, note, previous_stage,
    company_snapshot, segment_snapshot, origin_snapshot, value_snapshot,
    recorded_by, recorded_at, supersedes_id
  ) values (
    v_deal.id, v_previous.episode_id, p_reason_code, nullif(trim(p_reason_note), ''),
    v_previous.previous_stage, v_previous.company_snapshot, v_previous.segment_snapshot,
    v_previous.origin_snapshot, v_previous.value_snapshot, trim(p_actor), v_now,
    v_previous.id
  )
  returning * into v_current;

  update public.deals
  set loss_reason_code = p_reason_code,
      loss_reason_note = nullif(trim(p_reason_note), ''),
      loss_recorded_at = v_now,
      loss_recorded_by = trim(p_actor)
  where id = v_deal.id;

  insert into public.activities (deal_id, type, description, metadata, created_at)
  values (v_deal.id, 'deal_loss_corrected', 'Motivo da perda corrigido para ' || p_reason_code, jsonb_build_object(
    'previous_loss_record_id', v_previous.id, 'loss_record_id', v_current.id,
    'episode_id', v_current.episode_id, 'reason_code', p_reason_code,
    'note', nullif(trim(p_reason_note), ''), 'actor', trim(p_actor)
  ), v_now);

  select * into v_deal from public.deals where id = p_deal_id;
  return v_deal;
end;
$$;

revoke all on function public.transition_deal_stage_atomic(bigint, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.correct_deal_loss_reason_atomic(bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_deal_stage_atomic(bigint, text, text, text, text)
  to service_role;
grant execute on function public.correct_deal_loss_reason_atomic(bigint, text, text, text)
  to service_role;

-- ================================================================
-- STORY 034: DEMANDAS OPERACIONAIS DE CLIENTES
-- ================================================================

create table if not exists public.client_demands (
  id bigint generated always as identity primary key,
  deal_id integer references public.deals(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '',
  copy_text text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee text not null default '',
  destination_type text not null default 'other'
    check (destination_type in ('instagram', 'site', 'whatsapp', 'ads', 'presentation', 'drive', 'other')),
  destination_label text not null default '',
  starts_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'done' or completed_at is null)
);

create table if not exists public.client_demand_checklist_items (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 500),
  is_done boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_demand_links (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 240),
  url text not null check (url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_demand_attachments (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  file_name text not null check (length(trim(file_name)) between 1 and 240),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  created_at timestamptz not null default now()
);

create table if not exists public.client_demand_events (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  actor text not null,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists client_demands_due_status_idx on public.client_demands (status, due_at);
create index if not exists client_demands_deal_updated_idx on public.client_demands (deal_id, updated_at desc);
create index if not exists client_demands_assignee_idx on public.client_demands (assignee) where assignee <> '';
create index if not exists client_demand_checklist_demand_position_idx on public.client_demand_checklist_items (demand_id, position, id);
create index if not exists client_demand_links_demand_idx on public.client_demand_links (demand_id, created_at);
create index if not exists client_demand_attachments_demand_idx on public.client_demand_attachments (demand_id, created_at);
create index if not exists client_demand_events_demand_created_idx on public.client_demand_events (demand_id, created_at desc);

alter table public.client_demands enable row level security;
alter table public.client_demand_checklist_items enable row level security;
alter table public.client_demand_links enable row level security;
alter table public.client_demand_attachments enable row level security;
alter table public.client_demand_events enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demand-attachments', 'demand-attachments', false, 104857600,
  array[
    'image/*', 'video/*', 'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'text/csv', 'text/plain'
  ]
)
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.set_client_demand_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_demands_updated_at on public.client_demands;
create trigger client_demands_updated_at before update on public.client_demands
  for each row execute function public.set_client_demand_updated_at();
drop trigger if exists client_demand_checklist_updated_at on public.client_demand_checklist_items;
create trigger client_demand_checklist_updated_at before update on public.client_demand_checklist_items
  for each row execute function public.set_client_demand_updated_at();
drop trigger if exists client_demand_links_updated_at on public.client_demand_links;
create trigger client_demand_links_updated_at before update on public.client_demand_links
  for each row execute function public.set_client_demand_updated_at();

-- ================================================================
-- STORY 037: ARVORE DE PASTAS DAS DEMANDAS
-- ================================================================
-- Uma tabela auto-referenciada. Pasta raiz e o cliente; subpastas em qualquer
-- profundidade; a demanda pode morar em qualquer nivel, nao so na folha.

create table if not exists public.demand_folders (
  id bigint generated always as identity primary key,
  parent_id bigint references public.demand_folders(id) on delete cascade,
  deal_id integer references public.deals(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_demands
  add column if not exists folder_id bigint references public.demand_folders(id) on delete set null;

create index if not exists demand_folders_parent_position_idx on public.demand_folders (parent_id, position, id);
create index if not exists demand_folders_deal_idx on public.demand_folders (deal_id) where deal_id is not null;
create index if not exists client_demands_folder_idx on public.client_demands (folder_id) where folder_id is not null;

alter table public.demand_folders enable row level security;

drop trigger if exists demand_folders_updated_at on public.demand_folders;
create trigger demand_folders_updated_at before update on public.demand_folders
  for each row execute function public.set_client_demand_updated_at();

-- ================================================================
-- STORY 035: CHAT CONTEXTUAL MULTIAGENTE
-- ================================================================

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

-- ================================================================
-- STORY 043: CONTRATOS DENTRO DE CLIENTES
-- ================================================================

alter table public.clients
  add column if not exists representative_name text not null default '',
  add column if not exists representative_document text not null default '';

create table if not exists public.client_contract_number_counters (
  contract_year integer primary key check (contract_year between 2020 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_contracts (
  id bigint generated always as identity primary key,
  contract_number text not null unique check (contract_number ~ '^CTR-[0-9]{4}-[0-9]{4,}$'),
  client_id bigint references public.clients(id) on delete set null,
  template_key text not null check (template_key in ('general_services', 'visual_identity', 'social_media', 'mydrion_technology')),
  template_version integer not null default 1 check (template_version > 0),
  status text not null default 'draft' check (status in ('draft', 'generated', 'sent', 'signed', 'cancelled')),
  title text not null check (length(trim(title)) between 1 and 240),
  draft_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_payload) = 'object'),
  client_snapshot jsonb check (client_snapshot is null or jsonb_typeof(client_snapshot) = 'object'),
  provider_snapshot jsonb check (provider_snapshot is null or jsonb_typeof(provider_snapshot) = 'object'),
  document_snapshot jsonb check (document_snapshot is null or jsonb_typeof(document_snapshot) = 'object'),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contracts_generated_snapshot check (
    status in ('draft', 'cancelled') or (generated_at is not null and client_snapshot is not null and provider_snapshot is not null and document_snapshot is not null)
  )
);

create index if not exists client_contracts_client_updated_idx on public.client_contracts (client_id, updated_at desc);
alter table public.client_contracts enable row level security;
alter table public.client_contract_number_counters enable row level security;
revoke all on public.client_contracts from anon, authenticated;
revoke all on public.client_contract_number_counters from anon, authenticated;

drop trigger if exists client_contracts_updated_at on public.client_contracts;
create trigger client_contracts_updated_at before update on public.client_contracts
  for each row execute function public.set_client_demand_updated_at();

create or replace function public.allocate_client_contract_number(
  p_year integer default extract(year from timezone('America/Sao_Paulo', now()))::integer
)
returns text language plpgsql security definer set search_path = '' as $$
declare v_number integer;
begin
  if p_year < 2020 or p_year > 9999 then raise exception 'Ano de contrato invalido.'; end if;
  perform pg_advisory_xact_lock(20260829, p_year);
  insert into public.client_contract_number_counters (contract_year, last_number)
  values (p_year, 1)
  on conflict (contract_year) do update
    set last_number = public.client_contract_number_counters.last_number + 1, updated_at = now()
  returning last_number into v_number;
  return 'CTR-' || p_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.allocate_client_contract_number(integer) from public, anon, authenticated;
grant execute on function public.allocate_client_contract_number(integer) to service_role;

-- ================================================================
-- STORY 044: MUTACAO DE DEMANDA EM TRANSACAO UNICA
-- ================================================================

create or replace function public.apply_demand_update_atomic(
  p_demand_id bigint,
  p_updates jsonb,
  p_actor text,
  p_event_type text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.client_demands
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'title', 'description', 'copy_text', 'assignee', 'destination_label', 'priority',
    'destination_type', 'starts_at', 'due_at', 'value', 'billing_type', 'billing_month',
    'billing_until', 'client_id', 'deal_id', 'folder_id', 'status', 'completed_at'
  ];
  v_row public.client_demands%rowtype;
  v_new public.client_demands%rowtype;
  v_key text;
begin
  if p_demand_id is null or p_demand_id <= 0 then
    raise exception 'Demanda invalida.';
  end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' or p_updates = '{}'::jsonb then
    raise exception 'Nenhuma alteracao valida informada.';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Autoria da alteracao e obrigatoria.';
  end if;
  if nullif(trim(p_event_type), '') is null then
    raise exception 'Tipo do evento e obrigatorio.';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Metadata do evento deve ser um objeto.';
  end if;

  for v_key in select jsonb_object_keys(p_updates) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Coluna % nao pode ser alterada por esta rota.', v_key;
    end if;
  end loop;

  select * into v_row from public.client_demands where id = p_demand_id for update;
  if not found then
    raise exception 'Demanda nao encontrada.';
  end if;

  if v_row.client_id is null and v_row.deal_id is null
     and not (p_updates ? 'client_id') and not (p_updates ? 'deal_id') then
    raise exception 'A demanda perdeu o cliente e e somente leitura. Vincule um cliente para editar.';
  end if;

  v_new := jsonb_populate_record(v_row, p_updates);

  if (p_updates ? 'billing_type')
     and v_row.billing_type = 'installment'
     and v_new.billing_type is distinct from 'installment' then
    delete from public.client_demand_charges where demand_id = p_demand_id;
  end if;

  update public.client_demands set
    title = v_new.title,
    description = v_new.description,
    copy_text = v_new.copy_text,
    assignee = v_new.assignee,
    destination_label = v_new.destination_label,
    priority = v_new.priority,
    destination_type = v_new.destination_type,
    starts_at = v_new.starts_at,
    due_at = v_new.due_at,
    value = v_new.value,
    billing_type = v_new.billing_type,
    billing_month = v_new.billing_month,
    billing_until = v_new.billing_until,
    client_id = v_new.client_id,
    deal_id = v_new.deal_id,
    folder_id = v_new.folder_id,
    status = v_new.status,
    completed_at = v_new.completed_at
  where id = p_demand_id
  returning * into v_row;

  insert into public.client_demand_events (demand_id, actor, event_type, description, metadata)
  values (p_demand_id, trim(p_actor), trim(p_event_type), coalesce(p_description, ''), p_metadata);

  return v_row;
end;
$$;

create or replace function public.purge_demands_atomic(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_deleted bigint[];
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Informe ao menos um demandId valido.';
  end if;

  select coalesce(array_agg(a.storage_path), array[]::text[])
    into v_paths
  from public.client_demand_attachments a
  where a.demand_id = any(p_ids);

  with removidas as (
    delete from public.client_demands where id = any(p_ids) returning id
  )
  select coalesce(array_agg(id), array[]::bigint[]) into v_deleted from removidas;

  if array_length(v_deleted, 1) is null then
    return jsonb_build_object('deleted', array[]::bigint[], 'paths', array[]::text[]);
  end if;

  return jsonb_build_object('deleted', v_deleted, 'paths', v_paths);
end;
$$;

revoke all on function public.apply_demand_update_atomic(bigint, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.purge_demands_atomic(bigint[])
  from public, anon, authenticated;
grant execute on function public.apply_demand_update_atomic(bigint, jsonb, text, text, text, jsonb)
  to service_role;
grant execute on function public.purge_demands_atomic(bigint[])
  to service_role;

-- ================================================================
-- STORY 047: EDITOR VISUAL SEGURO DE AUTOMACOES DE E-MAIL
-- ================================================================

create table if not exists public.email_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'validated', 'archived')),
  graph jsonb not null check (jsonb_typeof(graph) = 'object'),
  version integer not null default 1 check (version > 0),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_automation_revisions (
  id bigint generated always as identity primary key,
  automation_id uuid not null references public.email_automations(id) on delete cascade,
  version integer not null check (version > 0),
  graph jsonb not null check (jsonb_typeof(graph) = 'object'),
  name text not null,
  description text not null default '',
  status text not null check (status in ('draft', 'validated', 'archived')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (automation_id, version)
);

create table if not exists public.email_automation_test_runs (
  id bigint generated always as identity primary key,
  automation_id uuid references public.email_automations(id) on delete set null,
  automation_version integer not null check (automation_version > 0),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  trace jsonb not null check (jsonb_typeof(trace) = 'array'),
  status text not null check (status in ('passed', 'failed')),
  error text,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists email_automations_updated_idx
  on public.email_automations (status, updated_at desc, id);
create index if not exists email_automation_revisions_lookup_idx
  on public.email_automation_revisions (automation_id, version desc);
create index if not exists email_automation_test_runs_lookup_idx
  on public.email_automation_test_runs (automation_id, created_at desc);

comment on table public.email_automations is
  'Grafos em rascunho do editor visual. Esta tabela nao ativa nem executa automacoes.';
comment on table public.email_automation_revisions is
  'Fotografias imutaveis de cada versao salva pelo editor visual.';
comment on table public.email_automation_test_runs is
  'Trilhas de simulacao sem efeitos externos.';

alter table public.email_automations enable row level security;
alter table public.email_automation_revisions enable row level security;
alter table public.email_automation_test_runs enable row level security;

drop policy if exists "Allow all" on public.email_automations;
drop policy if exists "Allow all" on public.email_automation_revisions;
drop policy if exists "Allow all" on public.email_automation_test_runs;

revoke all on public.email_automations from anon, authenticated;
revoke all on public.email_automation_revisions from anon, authenticated;
revoke all on public.email_automation_test_runs from anon, authenticated;

drop trigger if exists email_automations_updated_at on public.email_automations;
create trigger email_automations_updated_at
  before update on public.email_automations
  for each row execute function public.set_updated_at();

create or replace function public.create_email_automation(
  p_name text,
  p_description text,
  p_graph jsonb,
  p_created_by text
)
returns setof public.email_automations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created public.email_automations%rowtype;
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    raise exception 'invalid_automation_graph';
  end if;

  insert into public.email_automations (name, description, graph, created_by)
  values (trim(p_name), coalesce(p_description, ''), p_graph, coalesce(p_created_by, ''))
  returning * into v_created;

  insert into public.email_automation_revisions
    (automation_id, version, graph, name, description, status, created_by)
  values
    (v_created.id, v_created.version, v_created.graph, v_created.name,
     v_created.description, v_created.status, v_created.created_by);

  return next v_created;
end;
$$;

revoke execute on function public.create_email_automation(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_email_automation(text, text, jsonb, text)
  to service_role;

create or replace function public.save_email_automation(
  p_id uuid,
  p_expected_version integer,
  p_name text,
  p_description text,
  p_status text,
  p_graph jsonb,
  p_created_by text
)
returns setof public.email_automations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved public.email_automations%rowtype;
begin
  if p_status not in ('draft', 'validated', 'archived') then
    raise exception 'invalid_automation_status';
  end if;
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    raise exception 'invalid_automation_graph';
  end if;

  update public.email_automations
    set name = trim(p_name),
        description = coalesce(p_description, ''),
        status = p_status,
        graph = p_graph,
        version = version + 1
  where id = p_id and version = p_expected_version
  returning * into v_saved;

  if not found then
    raise exception 'version_conflict';
  end if;

  insert into public.email_automation_revisions
    (automation_id, version, graph, name, description, status, created_by)
  values
    (v_saved.id, v_saved.version, v_saved.graph, v_saved.name,
     v_saved.description, v_saved.status, coalesce(p_created_by, ''));

  return next v_saved;
end;
$$;

revoke execute on function public.save_email_automation(uuid, integer, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_email_automation(uuid, integer, text, text, text, jsonb, text)
  to service_role;
