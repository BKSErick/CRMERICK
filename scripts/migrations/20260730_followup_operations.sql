begin;

alter table public.deals
  add column if not exists response_type text not null default 'sem_resposta',
  add column if not exists response_type_source text not null default 'automatic',
  add column if not exists next_action_at timestamptz,
  add column if not exists next_action_type text,
  add column if not exists next_action_note text,
  add column if not exists next_action_source text not null default 'automatic',
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists response_time_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deals_response_type_check'
  ) then
    alter table public.deals
      add constraint deals_response_type_check
      check (response_type in (
        'sem_resposta', 'bot', 'humana', 'encaminhamento', 'objecao', 'perdido'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'deals_next_action_source_check'
  ) then
    alter table public.deals
      add constraint deals_next_action_source_check
      check (next_action_source in ('automatic', 'manual'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'deals_response_type_source_check'
  ) then
    alter table public.deals
      add constraint deals_response_type_source_check
      check (response_type_source in ('automatic', 'manual'));
  end if;
end
$$;

create index if not exists deals_next_action_at_idx
  on public.deals(next_action_at)
  where next_action_at is not null;
create index if not exists deals_response_type_idx
  on public.deals(response_type);

with message_times as (
  select
    deal_id,
    max(occurred_at) filter (where direction = 'received') as last_inbound_at,
    max(occurred_at) filter (where direction = 'sent') as last_outbound_at
  from public.messages
  where deal_id is not null
  group by deal_id
)
update public.deals d
set
  last_inbound_at = coalesce(d.last_inbound_at, mt.last_inbound_at),
  last_outbound_at = coalesce(d.last_outbound_at, mt.last_outbound_at)
from message_times mt
where d.id = mt.deal_id;

with activity_times as (
  select
    deal_id,
    max(created_at) filter (where type = 'whatsapp_received') as last_inbound_at,
    max(created_at) filter (
      where type in ('whatsapp_sent', 'whatsapp_sent_sync')
    ) as last_outbound_at
  from public.activities
  where deal_id is not null
  group by deal_id
)
update public.deals d
set
  last_inbound_at = case
    when at.last_inbound_at > coalesce(d.last_inbound_at, '-infinity'::timestamptz)
      then at.last_inbound_at
    else d.last_inbound_at
  end,
  last_outbound_at = case
    when at.last_outbound_at > coalesce(d.last_outbound_at, '-infinity'::timestamptz)
      then at.last_outbound_at
    else d.last_outbound_at
  end
from activity_times at
where d.id = at.deal_id;

with latest_received as (
  select distinct on (deal_id)
    deal_id,
    content,
    occurred_at
  from public.messages
  where deal_id is not null
    and direction = 'received'
  order by deal_id, occurred_at desc nulls last, id desc
)
update public.deals d
set response_type = case
  when lower(coalesce(lr.content, '')) ~
    '(mensagem autom[aá]tica|resposta autom[aá]tica|assistente virtual|hor[aá]rio de atendimento|selecione uma op[cç][aã]o|digite 1|aguarde que em breve)'
    then 'bot'
  when lower(coalesce(lr.content, '')) ~
    '(respons[aá]vel por compras|respons[aá]vel pelas compras|entre em contato com|fale com meu superior|encaminhar seu contato|vou encaminhar)'
    then 'encaminhamento'
  else 'humana'
end
from latest_received lr
where d.id = lr.deal_id
  and d.response_type = 'sem_resposta'
  and d.response_type_source = 'automatic';

-- A auditoria Webson de 2026-07-30 e a fonte mais qualificada para os 93 cards
-- vistoriados. Ela corrige o fallback textual quando a mensagem historica do bot
-- nao contem uma das frases deterministicas acima.
with latest_audit as (
  select distinct on (deal_id)
    deal_id,
    description
  from public.activities
  where deal_id is not null
    and description like '[AUDITORIA-WEBSON%'
  order by deal_id, created_at desc, id desc
)
update public.deals d
set response_type = case
  when la.description like '%Categoria: resposta_automatica.%' then 'bot'
  when la.description like '%Categoria: resposta_humana.%'
    and lower(la.description) ~ '(encaminh|respons[aá]vel por compras|superior respons[aá]vel)'
    then 'encaminhamento'
  when la.description like '%Categoria: resposta_humana.%' then 'humana'
  else d.response_type
end
from latest_audit la
where d.id = la.deal_id
  and d.response_type_source = 'automatic'
  and (
    la.description like '%Categoria: resposta_automatica.%'
    or la.description like '%Categoria: resposta_humana.%'
  );

update public.deals
set response_time_minutes = round(
  extract(epoch from (last_inbound_at - last_outbound_at)) / 60
)::integer
where last_inbound_at is not null
  and last_outbound_at is not null
  and last_inbound_at >= last_outbound_at
  and response_time_minutes is null;

with outbound_counts as (
  select
    d.id as deal_id,
    coalesce(
      nullif((
        select count(*) from public.messages m
        where m.deal_id = d.id and m.direction = 'sent'
      ), 0),
      (
        select count(*) from public.activities a
        where a.deal_id = d.id
          and a.type in ('whatsapp_sent', 'whatsapp_sent_sync')
      )
    )::integer as sent_count
  from public.deals d
)
update public.deals d
set
  next_action_at = case
    when d.response_type = 'bot' then d.last_inbound_at + interval '7 days'
    when d.response_type in ('humana', 'encaminhamento', 'objecao') then d.last_inbound_at
    when d.response_type = 'perdido' then null
    when oc.sent_count <= 1 then d.last_outbound_at + interval '2 days'
    when oc.sent_count = 2 then d.last_outbound_at + interval '3 days'
    when oc.sent_count = 3 then d.last_outbound_at + interval '5 days'
    else null
  end,
  next_action_type = case
    when d.response_type = 'bot' then 'followup_bot'
    when d.response_type = 'humana' then 'responder'
    when d.response_type = 'encaminhamento' then 'contactar_responsavel'
    when d.response_type = 'objecao' then 'tratar_objecao'
    when d.response_type = 'sem_resposta' and oc.sent_count between 0 and 3
      then 'followup_silencio'
    else null
  end,
  next_action_note = case
    when d.response_type = 'bot' then 'Resposta automatica; retomar em D+7.'
    when d.response_type = 'humana' then 'Resposta humana recebida; responder com contexto.'
    when d.response_type = 'encaminhamento' then 'Encaminhamento recebido; contatar o responsavel.'
    when d.response_type = 'objecao' then 'Objecao registrada; preparar resposta contextual.'
    when d.response_type = 'sem_resposta' and oc.sent_count between 0 and 3
      then 'Cadencia de silencio calculada pelo historico.'
    else null
  end,
  next_action_source = 'automatic'
from outbound_counts oc
where d.id = oc.deal_id
  and d.next_action_source = 'automatic'
  and (
    d.last_inbound_at is not null
    or d.last_outbound_at is not null
  );

commit;
