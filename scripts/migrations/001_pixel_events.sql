-- Migration 001: persistência de eventos do Facebook Pixel para read-back no funil.
-- Rodar: node scripts/apply-migration.mjs scripts/migrations/001_pixel_events.sql

create table if not exists public.pixel_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  page_url text,
  client_name text,
  button_name text,
  created_at timestamptz not null default now()
);

create index if not exists pixel_events_event_created_idx
  on public.pixel_events (event_name, created_at);

alter table public.pixel_events enable row level security;

-- anon (key publishable) só pode INSERIR eventos, nunca ler linhas cruas (privacidade)
drop policy if exists pixel_events_anon_insert on public.pixel_events;
create policy pixel_events_anon_insert on public.pixel_events
  for insert to anon, authenticated with check (true);

grant insert on public.pixel_events to anon, authenticated;

-- resumo agregado (só contagens) exposto via RPC — não vaza linhas individuais
create or replace function public.pixel_event_summary()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'views',        count(*) filter (where event_name = 'DiagnosticoView'),
    'ctaClicks',    count(*) filter (where event_name = 'DiagnosticoWhatsAppClick'),
    'reportClicks', count(*) filter (where event_name = 'DiagnosticoLinkClick'),
    'leads',        count(*) filter (where event_name = 'DiagnosticoWhatsAppClick'),
    'sales',        count(*) filter (where event_name = 'DiagnosticoSale'),
    'total',        count(*)
  )
  from public.pixel_events;
$$;

grant execute on function public.pixel_event_summary() to anon, authenticated;
