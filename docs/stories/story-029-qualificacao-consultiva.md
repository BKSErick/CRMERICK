# Story 029 - Qualificacao consultiva estruturada

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@data-engineer`, `@ux-design-expert`

## Story

Como operador comercial, quero registrar uma qualificacao consultiva baseada na
conversa e em evidencias, para saber por que uma oportunidade deve avancar e o
que ainda falta descobrir antes de apresentar a oferta.

## Contexto

O CRM possui dores, mensagens, classificacao, prioridade e score, mas nao possui
um registro comercial estruturado equivalente a BANT. A adaptacao do CRM Erick
deve usar linguagem do processo real: problema, impacto, decisor, urgencia,
capacidade de investimento, solucao desejada e evidencia.

A edicao acontece no overlay atual do `Pipeline`. Resumo e pendencias aparecem
na `Sala de Comando` quando relevantes. Nenhuma aba nova sera criada.

## Dependencias

- Story 027 concluida para registrar atualizacoes e sugestoes como eventos.
- Story 028 pode consumir a completude da qualificacao como evidencia, sem
  transformar campo ausente automaticamente em risco.

## Acceptance Criteria

- [ ] Cada deal pode registrar, separadamente: problema/gargalo, impacto,
  decisor/influenciadores, urgencia, capacidade de investimento, solucao
  desejada, oferta recomendada e evidencia de origem.
- [ ] Cada campo distingue `nao informado`, `sugerido pela IA` e `confirmado pelo
  operador`, preservando autoria e data da ultima alteracao.
- [ ] A IA pode sugerir valores usando mensagens e atividades, mas nenhuma
  sugestao vira confirmada sem acao explicita do operador.
- [ ] O sistema mostra completude e pendencias da qualificacao, sem bloquear o
  deal por uma regra BANT rigida.
- [ ] O overlay existente do Pipeline permite revisar, confirmar, corrigir e
  limpar os campos sem esconder a evidencia utilizada.
- [ ] A Sala de Comando destaca somente oportunidades em fase compativel que
  possuem lacunas relevantes, reaproveitando componentes/filas existentes.
- [ ] Existe consulta CLI por deal e relatorio de campos pendentes, sem exigir a UI.
- [ ] Alteracoes geram atividade auditavel e podem disparar apenas acoes seguras
  do motor da Story 027.
- [ ] Dados historicos continuam validos; deals antigos aparecem como `nao
  qualificados` sem preenchimento automatico inventado.
- [ ] A navegacao existente permanece inalterada; nenhuma rota ou aba nova e criada.
- [ ] Migration e schema local permanecem aditivos e sincronizados.
- [ ] Testes cobrem sugestao, confirmacao, correcao manual, limpeza, evidencia e
  deal legado sem qualificacao.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir contrato e estados dos campos consultivos (AC: 1, 2, 4).
- [x] Criar testes RED para persistencia, autoria e precedencia manual (AC: 2, 3, 8, 9, 12).
- [x] Criar migration, mapeamentos e rotas server-side necessarias (AC: 1, 9, 11).
- [x] Implementar extracao de sugestoes usando a infraestrutura atual de IA (AC: 3).
- [x] Integrar edicao e evidencias ao overlay do Pipeline (AC: 5, 10).
- [x] Integrar pendencias a Sala de Comando e criar consulta CLI (AC: 6, 7).
- [x] Executar regressao e quality gates (AC: 12, 13).
- [x] Atualizar checklist, Dev Agent Record e File List desta story.

## Fora de Escopo

- Nova aba de qualificacao.
- BANT rigido ou bloqueio automatico de etapa.
- IA confirmando informacoes ou alterando etapas.
- Enriquecimento pago de decisores.
- Forecast, tratado na Story 030.

## Dev Notes

- `src/lib/crmRecords.ts` ja possui `pains`, `leadMessages`, prioridade, origem e
  responsavel; manter compatibilidade de mapeamento.
- `src/app/api/ai/route.ts` ja oferece resumo, insight e proxima acao; reutilizar
  o provider e os padroes de validacao sem criar endpoint externo paralelo.
- `src/app/pipeline/page.tsx` e a superficie principal de edicao do deal.
- `src/app/comando/page.tsx` ja solicita proxima acao por IA e deve apenas receber
  o resumo das lacunas relevantes.

## Testing

- Testes unitarios do estado e da completude da qualificacao.
- Testes de API para sugestao versus confirmacao manual.
- Testes de regressao de deals legados e serializacao em `crmRecords`.
- Smoke visual do overlay sem aumentar a navegacao ou quebrar o uso mobile.

## CodeRabbit Integration

- Tipo: Full-stack + Database + AI; complexidade alta.
- Pre-Commit `@dev`: validacao de entrada, autoria, evidencia e precedencia manual.
- Pre-PR `@devops`: migration aditiva, RLS e compatibilidade de contratos.
- Self-healing: `@dev` light, ate 2 iteracoes/15 min, auto-fix apenas CRITICAL.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED inicial: `node --test --experimental-strip-types tests/deal-qualification.test.ts` falhou por modulo ainda inexistente.
- RED de concorrencia: teste comprovou ausencia de revisao otimista antes da correcao.
- GREEN focado: 11/11 testes da qualificacao; regressao final: 120/120 testes.
- Quality gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `git diff --check` aprovados.
- CodeRabbit CLI indisponivel porque a maquina nao possui distribuicao WSL; revisao estatica manual foi executada.

### Completion Notes List

- Documento v1 concentra sete campos consultivos com estados `not_informed`, `suggested` e `confirmed`, autoria, evidencia e data.
- Deals legados permanecem vazios e aparecem com 0% de completude; nenhuma ausencia bloqueia etapa ou vira informacao inventada.
- Sugestoes de IA usam apenas o deal selecionado apos clique explicito, nunca sobrescrevem campo confirmado e exigem confirmacao manual.
- O usuario autorizou em 2026-08-11 o envio sob demanda de mensagens e atividades do deal selecionado para OpenRouter/Groq. A coleta foi limitada a 20 mensagens, 1.500 caracteres por mensagem e 12.000 caracteres no conjunto.
- Persistencia server-side valida campos, usa revisao otimista contra sobrescrita concorrente, audita alteracoes e publica apenas o evento seguro `deal.qualification_updated`.
- Overlay do Pipeline permite sugerir, revisar evidencia, confirmar, corrigir e limpar; Sala de Comando reaproveita a fila existente somente em `qualified`, `proposal` e `negotiation`.
- CLI `npm run qualification:deals` e read-only e consulta um deal, etapa ou relatorio de pendencias sem exigir a UI.
- Nenhuma rota, pagina, aba, dependencia ou variavel de ambiente foi criada; o build manteve 59 paginas.
- O smoke ao vivo nao foi executado porque a migration ainda nao foi aplicada. Migration, commit, push e deploy permanecem fora deste fechamento local.

### File List

- `docs/plans/2026-08-11-qualificacao-consultiva-design.md`
- `docs/plans/2026-08-11-qualificacao-consultiva.md`
- `docs/stories/story-029-qualificacao-consultiva.md`
- `package.json`
- `scripts/deal-qualification.mjs`
- `scripts/migrations/20260811_deal_qualification.sql`
- `scripts/supabase-schema.sql`
- `src/app/api/ai/route.ts`
- `src/app/api/comando/route.ts`
- `src/app/api/deals/route.ts`
- `src/app/comando/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/commercialAutomation.mjs`
- `src/lib/crmRecords.ts`
- `src/lib/dealQualification.d.mts`
- `src/lib/dealQualification.mjs`
- `src/lib/dealQualificationService.d.mts`
- `src/lib/dealQualificationService.mjs`
- `tests/commercial-automation.test.ts`
- `tests/deal-qualification.test.ts`

## Change Log

- 2026-08-11: Story criada com qualificacao consultiva, sem BANT rigido e sem nova aba.
- 2026-08-11: Qualificacao consultiva v1 implementada e validada localmente; migration remota e deploy permanecem pendentes.
