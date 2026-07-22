-- Migration: agenda do CRM (reunioes, lembretes, compromissos).
-- Uma tabela unica alimenta a aba Calendario E a aba Reunioes (kind='reuniao').
-- Pode amarrar o evento a um lead (deal_id) ou contato (contact_id) — interliga a
-- agenda ao resto do CRM. RLS deny-by-default: so o service-role (nas rotas /api)
-- le e escreve, como activities/pixel_events.
-- Rodar: node scripts/apply-migration.mjs scripts/migrations/20260721_calendar_events.sql

create table if not exists public.calendar_events (
  id bigint generated always as identity primary key,
  title text not null,
  kind text not null default 'compromisso',   -- reuniao | lembrete | compromisso
  starts_at timestamptz not null,
  ends_at timestamptz,
  deal_id integer references public.deals(id) on delete set null,
  contact_id integer references public.contacts(id) on delete set null,
  location text,
  notes text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_starts_at_idx on public.calendar_events (starts_at);
create index if not exists calendar_events_kind_idx on public.calendar_events (kind);
create index if not exists calendar_events_deal_id_idx on public.calendar_events (deal_id) where deal_id is not null;

alter table public.calendar_events enable row level security;
-- Sem policies: deny-by-default. Acesso exclusivo via service-role nas rotas /api.
