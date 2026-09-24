-- Leitura tipada da mensagem de WhatsApp recebida (Story 057).
--
-- Por que: a leitura da IA era texto livre ("resumo, intencao, objecao, proximo passo") e
-- ninguem conseguia filtrar ou agir por ela: nada no app lia messages.ai_insight. Agora a
-- intencao e a objecao sao valores fechados, e a carta sugerida aponta uma chave do
-- content/sales-playbook.json (msg2, msg2Ponte, msg2Preco ou postResponse.cartas.*).
--
-- ai_card NAO tem check de proposito: a lista de cartas mora no playbook e muda sem migration.
-- Aditiva e repetivel. Nao altera nem apaga dado existente.

begin;

alter table public.messages
  add column if not exists ai_intent text,
  add column if not exists ai_objection text,
  add column if not exists ai_card text,
  add column if not exists ai_evidence text,
  add column if not exists ai_decided_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_ai_intent_check') then
    alter table public.messages add constraint messages_ai_intent_check check (
      ai_intent is null or ai_intent in (
        'sinal_forte', 'sinal_fraco', 'pergunta', 'objecao', 'encaminhamento', 'recusa', 'automatica', 'outro'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_ai_objection_check') then
    alter table public.messages add constraint messages_ai_objection_check check (
      ai_objection is null or ai_objection in (
        'nenhuma', 'preco', 'ja_tem_fornecedor', 'sem_urgencia', 'decisor_ausente', 'sem_interesse', 'fora_icp', 'outro'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_ai_decided_by_check') then
    alter table public.messages add constraint messages_ai_decided_by_check check (
      ai_decided_by is null or ai_decided_by in ('regra', 'llm')
    );
  end if;
end $$;

comment on column public.messages.ai_intent is
  'Intencao tipada da mensagem recebida (Story 057). Null quando ainda nao lida.';
comment on column public.messages.ai_objection is
  'Objecao tipada da mensagem recebida (Story 057).';
comment on column public.messages.ai_card is
  'Chave da carta do sales-playbook.json sugerida para responder. Nunca e enviada sozinha.';
comment on column public.messages.ai_evidence is
  'Trecho literal da fala do lead que sustenta a leitura.';
comment on column public.messages.ai_decided_by is
  'regra (sinais do playbook/classificador) ou llm (decisao tipada).';

-- A fila de releitura passa a considerar quem nao tem leitura tipada, inclusive quem ja
-- tinha o insight antigo em texto livre. So entra o que o webhook de fato le: WhatsApp da
-- Uazapi, com deal, sem placeholder de midia ("[audio]", "[imagem]"...). Antes a view
-- misturava e-mail recebido e midia, que nunca seriam lidos (medido em 24/09/2026: 1166
-- recebidas, 809 legiveis).
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
    and m.provider = 'uazapi'
    and m.deal_id is not null
    and coalesce(left(m.content, 1), '') <> '['
    and m.ai_intent is null
  order by m.occurred_at desc;

create index if not exists messages_deal_reading_idx
  on public.messages (deal_id, occurred_at desc)
  where direction = 'received' and ai_intent is not null;

commit;
