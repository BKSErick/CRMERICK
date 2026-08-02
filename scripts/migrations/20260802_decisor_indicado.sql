-- Fluxo de decisor indicado.
-- Aditiva e repetivel.
--
-- POR QUE: encaminhamento e a resposta mais comum do funil (4 das 11 conversas
-- reais). Sao os melhores leads que existem — ja passaram o gatekeeper e chegam
-- com indicacao interna — e hoje viram mensagem nova, desligada do deal de origem.
-- Guardar o contato indicado NO PROPRIO DEAL mantem a ligacao: o historico, o
-- segmento e a copy continuam valendo em vez de recomecar do zero.

alter table public.deals
  add column if not exists referred_name text,        -- nome do decisor indicado
  add column if not exists referred_phone text,       -- telefone so com digitos
  add column if not exists referred_by text,          -- quem dentro da empresa indicou
  add column if not exists referred_at timestamptz,   -- quando o repasse chegou
  add column if not exists referred_contacted_at timestamptz; -- quando o decisor foi abordado

-- Fila "encaminhamentos": indicado que ainda nao foi contatado. E a fila que
-- deve ser trabalhada ANTES de qualquer disparo frio novo.
create index if not exists deals_referral_pendente_idx
  on public.deals (referred_at desc)
  where referred_phone is not null and referred_contacted_at is null;