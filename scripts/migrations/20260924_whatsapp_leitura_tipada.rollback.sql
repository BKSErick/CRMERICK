begin;

drop index if exists public.messages_deal_reading_idx;

-- Volta a view para o criterio anterior (sem insight em texto livre).
create or replace view public.messages_ai_pendentes as
  select
    m.id,
    m.deal_id,
    d.name as deal_name,
    m.occurred_at,
    m.ai_attempts,
    m.ai_error,
    m.ai_last_attempt_at,
    left(m.content, 200) as trecho
  from public.messages m
  left join public.deals d on d.id = m.deal_id
  where m.direction = 'received'
    and m.ai_insight is null
  order by m.occurred_at desc;

alter table public.messages
  drop constraint if exists messages_ai_decided_by_check,
  drop constraint if exists messages_ai_objection_check,
  drop constraint if exists messages_ai_intent_check;

alter table public.messages
  drop column if exists ai_decided_by,
  drop column if exists ai_evidence,
  drop column if exists ai_card,
  drop column if exists ai_objection,
  drop column if exists ai_intent;

commit;
