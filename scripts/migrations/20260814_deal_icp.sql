-- ICP como dimensao separada do segmento.
-- Aditiva e repetivel.
--
-- POR QUE: segmento diz o que a empresa FAZ, ICP diz se ela TEM o problema. Ate
-- 14/08 o CRM so tinha a primeira dimensao, e isso produziu decisao errada de
-- alocacao: caldeiraria aparecia com 14 abordados e 0 respostas, o que lia como
-- "segmento morto". O balde tem serralheria, calhas e moveis industriais dentro
-- (sem orcamento tecnico variavel, nunca iam responder) e tem a Esmetal, alvo
-- prime da regiao, abordada com a mesma mensagem que a RV Calhas.
--
-- Sem esta coluna, toda taxa por segmento continua misturando quem tem o problema
-- com quem nunca teria, e o scoring aprende com ruido.
--
-- Preenchida por scripts/classify-icp.mjs (regra deterministica em
-- scripts/lib/analise-comum.mjs). null e valor legitimo: significa "nao da pra
-- afirmar", e o lead segue na fila ate revisao manual.

alter table public.deals
  add column if not exists is_icp boolean,       -- true dentro, false fora, null indefinido
  add column if not exists icp_source text;      -- 'regra' | 'manual'

comment on column public.deals.is_icp is
  'Tem orcamento tecnico variavel (servico, medida, material)? Independente de segment_norm.';

-- Fila de prospeccao valida: prospect dentro do ICP ainda nao abordado.
-- is_icp is not false mantem os indefinidos na fila de proposito.
create index if not exists deals_fila_icp_idx
  on public.deals (stage, segment_norm)
  where is_prospect = true and is_icp is not false;
