-- Story 029: qualificacao consultiva estruturada, auditavel e retrocompativel.
-- Deals legados mantem objeto vazio e aparecem como nao qualificados.

alter table public.deals
  add column if not exists qualification jsonb not null default '{}'::jsonb,
  add column if not exists qualification_revision integer not null default 0;

do $$
begin
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

-- A Story 029 amplia somente o vocabulario de eventos. As acoes continuam
-- limitadas pelo check e pelos guards do motor seguro da Story 027.
alter table public.commercial_events
  drop constraint if exists commercial_events_event_type_check;
alter table public.commercial_events
  add constraint commercial_events_event_type_check check (event_type in (
    'message.received', 'message.sent', 'deal.stage_changed',
    'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed',
    'deal.qualification_updated'
  ));

alter table public.commercial_automation_rules
  drop constraint if exists commercial_automation_rules_event_type_check;
alter table public.commercial_automation_rules
  add constraint commercial_automation_rules_event_type_check check (event_type in (
    'message.received', 'message.sent', 'deal.stage_changed',
    'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed',
    'deal.qualification_updated'
  ));
