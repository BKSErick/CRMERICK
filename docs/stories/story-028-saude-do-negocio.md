# Story 028 - Saude explicavel do negocio

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@data-engineer`, `@architect`

## Story

Como operador comercial, quero enxergar a saude de cada negocio e os fatores que
formam essa leitura, para priorizar oportunidades em risco ou avancando sem
confundir potencial de prospeccao com progresso comercial real.

## Contexto

O score atual prioriza leads antes e durante a abordagem. Esta story cria uma
metrica diferente, especifica para negocios em andamento, baseada em evidencias
do CRM: recencia, resposta, etapa, proxima acao, decisor, reuniao e proposta.

Nao sera criada aba. O indicador entra nos cards e no detalhe do `Pipeline`; os
casos criticos entram nas filas e alertas existentes da `Sala de Comando`.

## Dependencias

- Story 027 pronta ou contrato equivalente de eventos disponivel.
- Reutilizar atividades, mensagens, reunioes e campos operacionais existentes.

## Acceptance Criteria

- [ ] Existe uma funcao deterministica e compartilhada que calcula saude de 0 a
  100, classificacao textual, fatores positivos, riscos e data do calculo.
- [ ] O calculo considera, no minimo: ultima entrada/saida, tempo na etapa,
  proxima acao, resposta humana, encaminhamento/decisor, reuniao, proposta e
  data esperada de fechamento quando existirem.
- [ ] Lead score e deal health permanecem conceitos separados e rotulados de
  forma inequivoca na UI e nos contratos.
- [ ] Todo valor exibido possui explicacao legivel; nenhum numero e produzido
  apenas por IA ou por peso oculto.
- [ ] Dados ausentes reduzem confianca ou geram aviso, sem serem tratados como
  sinal negativo inventado.
- [ ] Correcao manual de proxima acao e classificacao continua prevalecendo.
- [ ] Cards do Pipeline mostram somente indicador compacto; o overlay detalha os
  fatores, riscos e a proxima acao recomendada.
- [ ] Sala de Comando reutiliza as filas existentes para destacar negocios sem
  proxima acao, parados ou em risco, sem criar uma nova fila duplicada.
- [ ] Existe comando CLI que recalcula/simula a saude, filtra por faixa e explica
  cada resultado antes de qualquer persistencia.
- [ ] O calculo pode ser reconstruido a partir das fontes reais, e sua persistencia
  e atualizada de modo idempotente quando eventos relevantes mudam.
- [ ] A navegacao existente permanece inalterada; nenhuma rota ou aba nova e criada.
- [ ] Testes cobrem negocio saudavel, parado, sem dados, com acao manual, com
  reuniao realizada e com proposta sem retorno.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir rubricas, faixas e contrato de explicacao (AC: 1-5).
- [x] Escrever testes RED para a funcao pura de health score (AC: 1-6, 12).
- [x] Implementar calculo compartilhado e persistencia/recalculo idempotente (AC: 9, 10).
- [x] Integrar o indicador ao Pipeline e as filas atuais do Comando (AC: 7, 8, 11).
- [x] Instrumentar eventos da Story 027 que exigem recalculo (AC: 10).
- [x] Executar regressao e quality gates (AC: 12, 13).
- [x] Atualizar checklist, Dev Agent Record e File List desta story.

## Fora de Escopo

- Nova aba de health score.
- Score de churn de clientes ativos.
- Modelo preditivo treinado ou dependencia de LLM para formar a nota.
- Alteracao automatica de etapa ou envio de mensagem.
- Forecast de receita, tratado na Story 030.

## Dev Notes

- `src/lib/leadScoring.js` permanece a fonte do score de prospeccao e nao deve ser
  renomeado como health score.
- `src/lib/crmRecords.ts` ja expoe etapa, probabilidade, prioridade, datas de
  entrada/saida e proxima acao.
- `src/lib/followup.ts` concentra classificacao de resposta e filas operacionais.
- `src/lib/funnelMetrics.ts` e a referencia para funcoes puras e deterministicas.
- Superficies: `src/app/pipeline/page.tsx` e `src/app/comando/page.tsx`.

## Testing

- Tabela de casos unitarios com score esperado e lista de motivos.
- Teste de estabilidade: mesma entrada produz exatamente a mesma saida.
- Teste de precedencia manual e de ausencia de dados.
- Smoke visual nos cards, overlay e Sala de Comando em desktop/mobile.

## CodeRabbit Integration

- Tipo: Full-stack + Database; complexidade media-alta.
- Pre-Commit `@dev`: determinismo, explicabilidade e separacao entre scores.
- Pre-PR `@devops`: compatibilidade de schema e regressao visual.
- Self-healing: `@dev` light, ate 2 iteracoes/15 min, auto-fix apenas CRITICAL.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED inicial: `node --test --experimental-strip-types tests/deal-health.test.ts` falhou porque o modulo de health ainda nao existia.
- GREEN focado: 13/13 testes do deal health; regressao final: 109/109 testes.
- Quality gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `git diff --check` aprovados.
- CodeRabbit CLI indisponivel: a maquina nao possui distribuicao WSL nem binario Windows; foi realizada revisao estatica manual.

### Completion Notes List

- Rubrica v1 publica e deterministica separa `deal_health` do lead score, com pesos, faixas, confianca, evidencias, riscos e recomendacao explicados.
- Calculo reconstrutivel usa deal, mensagens e reunioes reais; fingerprint e atualizacao condicional evitam persistencia duplicada em eventos repetidos.
- Correcao manual de proxima acao prevalece; dados ausentes geram avisos e reduzem confianca sem penalidade inventada.
- Pipeline recebeu indicador compacto e explicacao no overlay; Sala de Comando reaproveita a fila atual para revisoes de risco sem envio automatico.
- CLI e dry-run por padrao, filtra por faixa e mostra a explicacao antes de aceitar persistencia explicita com `--go`.
- Nenhuma pagina, rota de tela ou aba foi criada; o build manteve as 59 paginas existentes.
- O smoke ao vivo com dados remotos nao foi executado porque a migration nao foi aplicada. Migration, commit, push e deploy permanecem fora deste fechamento local.

### File List

- `docs/stories/story-028-saude-do-negocio.md`
- `package.json`
- `scripts/deal-health.mjs`
- `scripts/migrations/20260811_deal_health.sql`
- `scripts/prospeccao-runner.mjs`
- `scripts/supabase-schema.sql`
- `src/app/api/comando/route.ts`
- `src/app/api/deals/route.ts`
- `src/app/comando/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/commercialAutomationService.mjs`
- `src/lib/crmRecords.ts`
- `src/lib/dealHealth.d.mts`
- `src/lib/dealHealth.mjs`
- `src/lib/dealHealthService.d.mts`
- `src/lib/dealHealthService.mjs`
- `tests/deal-health.test.ts`

## Change Log

- 2026-08-11: Story criada para inserir health score nas superficies existentes.
- 2026-08-11: Saude explicavel v1 implementada e validada localmente; migration remota e deploy permanecem pendentes.
