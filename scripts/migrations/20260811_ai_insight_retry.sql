-- Instrumentacao da leitura de IA do webhook de WhatsApp.
--
-- Por que: o enriquecimento roda inline no webhook dentro de um try/catch que so fazia
-- console.error. Quando o provider caia, a mensagem ficava sem ai_insight e era
-- indistinguivel de uma que nunca chegou a ser tentada. Em 11/08/2026 havia 38 recebidas
-- nesse estado, concentradas em 29/07 (15) e 07/08 (8), sem nenhum rastro do motivo.
--
-- Aditiva e repetivel (add column if not exists). Nao altera nem apaga dado existente.

alter table public.messages
  -- Motivo da ultima falha. Fica null quando a leitura deu certo.
  add column if not exists ai_error text,
  -- Quantas vezes ja tentamos. Serve de teto pro reprocessamento nao entrar em loop
  -- com mensagem que falha sempre (conteudo vazio, audio sem transcricao, etc).
  add column if not exists ai_attempts smallint not null default 0,
  add column if not exists ai_last_attempt_at timestamptz;

comment on column public.messages.ai_error is
  'Motivo da ultima falha na leitura da IA. Null quando teve sucesso.';
comment on column public.messages.ai_attempts is
  'Quantas vezes a leitura da IA foi tentada nesta mensagem.';
comment on column public.messages.ai_last_attempt_at is
  'Quando foi a ultima tentativa de leitura da IA.';

-- Fila de reprocessamento. Recebidas sem insight, mais recentes primeiro.
-- As 38 antigas entram aqui com ai_attempts = 0 porque a falha delas e anterior
-- a instrumentacao: nao da pra saber o motivo, so que nao tem insight.
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
