-- Migration: fios de integração 3 e 4 (schema).
-- Aditiva e reversível: adiciona colunas/índices, faz backfill, atualiza o trigger
-- do quiz. NUNCA remove as colunas de texto (company/name) — o join por string
-- continua como fallback. Rodar: node scripts/apply-migration.mjs scripts/migrations/20260721_integration_wires.sql

-- ============================================================
-- FIO 3 — deals.contact_id: chave real deals -> contacts
-- ============================================================
alter table public.deals
  add column if not exists contact_id integer references public.contacts(id) on delete set null;

create index if not exists deals_contact_id_idx
  on public.deals (contact_id) where contact_id is not null;

-- Backfill 1: casa por empresa (case-insensitive), que é o vínculo mais forte.
update public.deals d
set contact_id = c.id
from public.contacts c
where d.contact_id is null
  and nullif(trim(d.company), '') is not null
  and lower(trim(d.company)) = lower(trim(c.company));

-- Backfill 2: sobra casa por nome do contato (mesmo import do Garimpo).
update public.deals d
set contact_id = c.id
from public.contacts c
where d.contact_id is null
  and nullif(trim(d.name), '') is not null
  and lower(trim(d.name)) = lower(trim(c.name));

-- ============================================================
-- FIO 4 — origem do lead: de qual quiz/linha ele veio
-- ============================================================
alter table public.deals
  add column if not exists origin text,
  add column if not exists origin_detail text;

-- Backfill: deals materializados de quiz herdam source/quiz_id do quiz_leads.
update public.deals d
set origin = 'quiz:' || coalesce(nullif(trim(q.source), ''), 'quiz'),
    origin_detail = nullif(trim(q.quiz_id), '')
from public.quiz_leads q
where q.materialized_deal_id = d.id
  and d.origin is null;

-- Trigger do quiz atualizado: carimba origin/origin_detail no deal e loga uma
-- activity na timeline (fio 1 para o caminho inbound do quiz). Mantém toda a
-- lógica de materialização anterior.
create or replace function public.materialize_quiz_lead_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_deal_id bigint;
  lead_name text;
  score_value numeric;
  lead_origin text;
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  new.whatsapp := nullif(regexp_replace(coalesce(new.whatsapp, new.phone, ''), '\D', '', 'g'), '');
  new.source := coalesce(nullif(trim(new.source), ''), 'quiz');
  score_value := coalesce(new.score, 0);
  lead_name := coalesce(nullif(trim(new.name), ''), new.email, new.phone, new.external_id, 'Lead do quiz');
  lead_origin := 'quiz:' || new.source;

  select id into target_deal_id
  from public.deals
  where (new.phone is not null and (phone = new.phone or whatsapp = new.phone))
    or (new.whatsapp is not null and (phone = new.whatsapp or whatsapp = new.whatsapp))
    or (new.email is not null and lower(coalesce(copy_text, '')) like '%' || new.email || '%')
  order by updated_at desc nulls last, id desc
  limit 1;

  if target_deal_id is null then
    insert into public.deals (
      name, company, segment, value, prob, stage, owner, tag, tag_type,
      ticket_id, points, progress, assignee, copy_text, phone, whatsapp,
      origin, origin_detail, updated_at
    )
    values (
      lead_name,
      lead_name,
      coalesce(nullif(trim(new.gargalo), ''), 'Quiz'),
      0,
      greatest(0, least(100, score_value)),
      'prospect',
      'Erick',
      'Quiz',
      'research',
      'QUIZ-' || coalesce(new.external_id, new.id::text),
      greatest(1, least(10, ceil(score_value / 10.0)::int)),
      greatest(0, least(100, score_value)),
      'Erick',
      concat_ws(E'\n',
        'Lead capturado pelo quiz.',
        case when new.email is not null then 'Email: ' || new.email end,
        case when new.gargalo is not null then 'Gargalo: ' || new.gargalo end,
        'Score: ' || score_value::text
      ),
      new.phone,
      new.whatsapp,
      lead_origin,
      nullif(trim(new.quiz_id), ''),
      now()
    )
    returning id into target_deal_id;
  else
    update public.deals
    set
      segment = coalesce(nullif(trim(new.gargalo), ''), segment),
      prob = greatest(coalesce(prob, 0), greatest(0, least(100, score_value))),
      points = greatest(coalesce(points, 1), greatest(1, least(10, ceil(score_value / 10.0)::int))),
      progress = greatest(coalesce(progress, 0), greatest(0, least(100, score_value))),
      tag = coalesce(tag, 'Quiz'),
      tag_type = coalesce(tag_type, 'research'),
      phone = coalesce(phone, new.phone),
      whatsapp = coalesce(whatsapp, new.whatsapp),
      origin = coalesce(origin, lead_origin),
      origin_detail = coalesce(origin_detail, nullif(trim(new.quiz_id), '')),
      copy_text = concat_ws(E'\n',
        nullif(copy_text, ''),
        'Novo resultado de quiz: score ' || score_value::text || coalesce(' / gargalo ' || nullif(trim(new.gargalo), ''), '')
      ),
      updated_at = now()
    where id = target_deal_id;
  end if;

  -- Timeline: o quiz vira evento na ficha do deal (fio 1, caminho inbound).
  insert into public.activities (deal_id, type, description)
  values (
    target_deal_id,
    'quiz_lead',
    'Veio do Quiz (' || new.source || ') · score ' || score_value::text
      || coalesce(' · gargalo ' || nullif(trim(new.gargalo), ''), '')
  );

  new.materialized_deal_id := target_deal_id;
  return new;
end;
$$;
