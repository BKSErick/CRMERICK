-- Story 025: rastreabilidade de copy/oferta e funil de reunioes mensuravel.
-- Migration aditiva e repetivel. Nao envia mensagens nem altera stages.

alter table public.deals
  add column if not exists copy_version text,
  add column if not exists copy_variant text,
  add column if not exists offer_version text,
  add column if not exists experiment_id text;

alter table public.activities
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.calendar_events
  add column if not exists meeting_status text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists held_at timestamptz;

update public.calendar_events
set meeting_status = case when done then 'held' else 'scheduled' end,
    held_at = case when done then coalesce(held_at, starts_at) else held_at end
where kind = 'reuniao' and meeting_status is null;

update public.calendar_events
set meeting_status = null, confirmed_at = null, held_at = null
where kind <> 'reuniao' and meeting_status is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_copy_variant_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals
      add constraint deals_copy_variant_check check (copy_variant is null or copy_variant in ('A', 'B'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_events_meeting_status_check'
      and conrelid = 'public.calendar_events'::regclass
  ) then
    alter table public.calendar_events
      add constraint calendar_events_meeting_status_check check (
        (kind = 'reuniao' and meeting_status in ('scheduled', 'confirmed', 'held', 'no_show', 'cancelled'))
        or (kind <> 'reuniao' and meeting_status is null)
      );
  end if;
end $$;

create index if not exists deals_experiment_variant_idx
  on public.deals (experiment_id, copy_variant)
  where experiment_id is not null;

create index if not exists calendar_events_meeting_status_idx
  on public.calendar_events (meeting_status, starts_at)
  where kind = 'reuniao';
