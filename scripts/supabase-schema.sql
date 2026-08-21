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
