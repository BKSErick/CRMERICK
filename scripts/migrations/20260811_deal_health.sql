-- Story 028: saude explicavel do negocio.
-- Persistencia aditiva no deal; calculo reconstruivel de deals, messages e calendar_events.

alter table public.deals
  add column if not exists stage_entered_at timestamptz,
  add column if not exists deal_health_score integer,
  add column if not exists deal_health_classification text,
  add column if not exists deal_health_confidence integer,
  add column if not exists deal_health_factors jsonb not null default '[]'::jsonb,
  add column if not exists deal_health_risks jsonb not null default '[]'::jsonb,
  add column if not exists deal_health_warnings jsonb not null default '[]'::jsonb,
  add column if not exists deal_health_recommended_action text,
  add column if not exists deal_health_calculated_at timestamptz,
  add column if not exists deal_health_fingerprint text,
  add column if not exists deal_health_rubric_version integer;

update public.deals
set stage_entered_at = coalesce(stage_entered_at, updated_at, created_at, now())
where stage_entered_at is null;

alter table public.deals alter column stage_entered_at set default now();

do $$
begin
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
      check (deal_health_classification is null or deal_health_classification in (
        'excelente', 'saudavel', 'atencao', 'em_risco', 'critico', 'ganho', 'perdido'
      ));
  end if;
end $$;

create index if not exists deals_health_active_risk_idx
  on public.deals (deal_health_score, deal_health_calculated_at)
  where stage not in ('won', 'lost');
