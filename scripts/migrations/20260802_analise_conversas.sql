-- Analise de conversas por tipo de empresa.
-- Aditiva e repetivel (add column if not exists). Nao altera nem apaga dado existente.
--
-- Por que colunas em deals e nao tabela nova: a unidade de analise e o LEAD, e o
-- deal ja e a linha do lead. Tabela separada obrigaria join em todo relatorio e
-- abriria espaco pra duas verdades sobre o mesmo lead.

alter table public.deals
  -- Segmento canonico derivado. O campo `segment` original fica INTACTO porque
  -- guarda a categoria crua do Google Maps, que e sinal util (e irrecuperavel
  -- se for sobrescrito). Todo corte "por tipo de empresa" usa segment_norm.
  add column if not exists segment_norm text,
  add column if not exists segment_norm_source text,   -- 'canonico' | 'inferido' | 'manual'

  -- Schwartz: consciencia (1-5) e sofisticacao de mercado (1-5). Rubrica completa
  -- em docs/ANALISE-conversas.md. Guardados como int pra permitir media/corte.
  add column if not exists awareness_level smallint,
  add column if not exists sophistication_level smallint,

  -- A oferta ficou clara PRA ELE? Medido pela reacao do lead, nao pela nossa copy.
  -- 'clara' | 'parcial' | 'confusa' | 'nao_avaliavel'
  add column if not exists offer_clarity text,

  -- O que o lead efetivamente demandou, quando demandou algo.
  -- 'pagina_nova' | 'redesign' | 'seo_geo' | 'formulario_orcamento'
  -- | 'integracao_whatsapp' | 'preco_apenas' | 'outro' | 'nenhuma'
  add column if not exists offer_demanded text,

  -- Profundidade da conversa, 0 a 5. Rubrica no doc.
  add column if not exists conversation_depth smallint,

  -- Por que travou. Alimenta o diagnostico de follow-up.
  -- 'sem_resposta' | 'gatekeeper_bot' | 'preco' | 'sem_urgencia' | 'ja_tem_fornecedor'
  -- | 'decisor_ausente' | 'canal_errado' | 'audio_nao_transcrito' | 'nao_travou' | 'outro'
  add column if not exists blocker text,

  -- Frase curta do proprio lead que sustenta a classificacao. Serve de auditoria:
  -- se a evidencia nao convence, a classificacao esta errada.
  add column if not exists classification_evidence text,

  add column if not exists classified_at timestamptz,
  add column if not exists classified_by text,          -- 'ia' | 'erick'
  add column if not exists classification_model text,

  -- Prospeccao fria de verdade? false para cliente atual (Jotta, Metalthec),
  -- contato pessoal, ex-socio e thread orfa "WhatsApp NNNN".
  -- Persistido em vez de recalculado: o relatorio roda em Node (scripts) e a tela
  -- em TypeScript (app). Manter a regra em dois lugares faria os dois numeros
  -- divergirem em silencio. Aqui quem decide e o normalize-segments.mjs, e o app
  -- so filtra por esta coluna.
  add column if not exists is_prospect boolean;

-- Fila de auditoria: o que a IA classificou e o Erick ainda nao confirmou.
create index if not exists deals_classificacao_idx
  on public.deals (segment_norm, classified_at desc)
  where classified_at is not null;

-- messages.direction usa 'received' / 'sent' (nao 'in' / 'out').
-- Indice para montar a thread de um deal em ordem cronologica sem varrer a tabela.
create index if not exists messages_deal_occurred_idx
  on public.messages (deal_id, occurred_at)
  where deal_id is not null;