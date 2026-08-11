# Story 031 - Razoes de perda e aprendizado comercial

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@data-engineer`

## Story

Como operador comercial, quero registrar por que cada oportunidade foi perdida,
para corrigir oferta, canal, qualificacao e follow-up com base em dados reais.

## Contexto

O pipeline possui a etapa `lost`, mas nao ha motivo estruturado de perda. Esta
story adiciona classificacao auditavel no momento em que o deal e arquivado e
usa os dados no funil e nos achados existentes.

Nao sera criada aba. A captura acontece no `Pipeline`; o agregado aparece em
`Funis` e o aprendizado pode alimentar `Achados`/`Analise` existentes.

## Dependencias

- Story 027 concluida para auditar a transicao e seus efeitos.
- Pode ser implementada antes da Story 030, mas o forecast deve consumir seu resultado.

## Acceptance Criteria

- [x] Ao mover um deal para `lost`, o sistema exige uma razao estruturada antes
  de concluir a transicao.
- [x] O catalogo inicial inclui: sem orcamento, sem prioridade, sem retorno, sem
  acesso ao decisor, momento inadequado, concorrente, oferta inadequada, sem fit,
  canal/dado invalido e outro com nota obrigatoria.
- [x] Razao, nota, autoria e data ficam persistidas e registradas na timeline.
- [x] Cancelar a captura mantem o deal na etapa anterior e nao grava perda parcial.
- [x] Reabrir um deal preserva o historico da perda anterior e marca o registro
  como superado, sem apagar evidencia.
- [x] Deals historicos em `lost` permanecem validos como `motivo nao informado`;
  nao existe backfill inventado ou alteracao em massa nesta story.
- [x] O overlay do Pipeline permite consultar e corrigir o motivo com nova
  atividade de auditoria.
- [x] Funis exibe distribuicao e taxa por razao, segmento, origem e periodo quando
  houver base suficiente, sem inferir causalidade.
- [x] Achados/Analise pode receber resumo deterministico ou compilacao assistida,
  sempre mostrando contagens e periodo de origem.
- [x] Existe comando CLI que lista perdas sem motivo e agrega razoes por periodo.
- [x] A navegacao existente permanece inalterada; nenhuma rota ou aba nova e criada.
- [x] Migration e schema local sao aditivos e preservam transicoes atuais.
- [x] Testes cobrem exigencia, cancelamento, `outro`, reabertura, correcao e legado.
- [x] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir catalogo, contrato e regras de historico (AC: 1-6).
- [x] Escrever testes RED da transicao atomica para `lost` (AC: 1-7, 13).
- [x] Criar migration e persistencia auditavel (AC: 3, 5, 6, 12).
- [x] Integrar captura/correcao ao fluxo existente do Pipeline (AC: 1, 4, 7, 11).
- [x] Implementar agregacoes no Funil/Achados e comando CLI (AC: 8-10).
- [x] Integrar o motivo ao forecast sem misturar perdido com previsto (AC: 8).
- [x] Executar regressao e quality gates (AC: 13, 14).
- [x] Atualizar checklist, Dev Agent Record e File List desta story.

## Fora de Escopo

- Nova aba de perdas.
- Classificacao retroativa por IA.
- Alteracao automatica de oferta, preco ou segmento.
- Exclusao definitiva do historico de perda.

## Dev Notes

- `src/lib/crmRecords.ts` define `lost` como etapa valida, mas nao possui razao de perda.
- `src/store/useCRMStore.ts` e `src/app/api/deals/route.ts` implementam a mudanca
  de etapa e o registro de atividade atual; tornar a operacao atomica.
- `src/app/pipeline/page.tsx` deve incorporar a captura ao drag/drop e ao select.
- `src/lib/funnelMetrics.ts` e `src/app/funil/page.tsx` concentram agregacoes.
- `src/app/insights/page.tsx` ja e o repositorio de aprendizados; nao duplicar esse papel.

## Testing

- Testes unitarios do catalogo e validacao de `outro`.
- Testes de API/transacao para cancelamento, falha e reabertura.
- Regressao do drag/drop e da atualizacao por select.
- Smoke visual do modal/overlay e agregados nas telas existentes.

## CodeRabbit Integration

- Tipo: Database + API + Frontend; complexidade media-alta.
- Pre-Commit `@dev`: atomicidade, historico e validacao.
- Pre-PR `@devops`: migration aditiva, RLS e regressao de transicao.
- Self-healing: `@dev` light, ate 2 iteracoes/15 min, auto-fix apenas CRITICAL.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (Dex)

### Debug Log References

- RED: `node --test tests/deal-loss-reasons.test.ts` falhou inicialmente por modulo ausente.
- GREEN focal: `node --test tests/deal-loss-reasons.test.ts` - 14/14 PASS.
- Regressao: `npm test` - 145/145 PASS.
- Gates: `npm run lint`, `npm run typecheck` e `npm run build` - PASS; build com 59 rotas.
- Migration: lote 027-031 validado com `BEGIN/ROLLBACK`, aplicado via Management API (HTTP 201) e confirmado por catalogo remoto.
- Smoke remoto somente leitura: `npm run losses:deals` confirmou tabela acessivel, zero perdas estruturadas no periodo e legado preservado sem backfill.
- Smoke visual local: modal abriu sobre deal em `prospect`; cancelar manteve a etapa e gerou zero requisicoes PATCH.
- CodeRabbit: indisponivel no ambiente (`coderabbit` ausente e WSL sem distribuicao instalada).

### Completion Notes List

- Catalogo v1 com dez motivos e nota obrigatoria para `other`.
- Entrada e saida de `lost` usam RPC transacional com historico versionado, autoria e atividades de timeline.
- Correcao cria nova versao; reabertura supera a versao ativa e limpa apenas o snapshot atual.
- Deals antigos continuam como `Motivo nao informado`; nenhum dado historico foi inferido ou atualizado em massa.
- Pipeline captura por drag/drop e select; overlay consulta/corrige. Funis e Achados mostram distribuicao com periodo, amostra e ressalva de nao causalidade.
- Forecast mantem perdidos fora da previsao e reaproveita o motivo apenas como explicacao.
- CLI `npm run losses:deals -- --from=YYYY-MM-DD --to=YYYY-MM-DD` permanece somente leitura.
- As migrations das Stories 027, 028, 029 e 031 foram aplicadas no Supabase por autorizacao explicita do usuario. Commit, push e deploy nao foram executados.

### File List

- `docs/plans/2026-08-11-razoes-perda-design.md`
- `docs/plans/2026-08-11-razoes-perda.md`
- `docs/stories/story-031-razoes-de-perda.md`
- `package.json`
- `scripts/apply-migration.mjs`
- `scripts/deal-losses.mjs`
- `scripts/migrations/20260811_deal_loss_reasons.sql`
- `scripts/smoke-loss-reasons-visual.mjs`
- `scripts/supabase-schema.sql`
- `scripts/verify-20260811-migrations.mjs`
- `src/app/api/deals/route.ts`
- `src/app/api/funnel/route.ts`
- `src/app/api/insights/route.ts`
- `src/app/funil/page.tsx`
- `src/app/insights/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/crmRecords.ts`
- `src/lib/dealForecast.d.mts`
- `src/lib/dealForecast.mjs`
- `src/lib/dealForecastService.mjs`
- `src/lib/dealLossReasons.d.mts`
- `src/lib/dealLossReasons.mjs`
- `src/lib/dealLossService.d.mts`
- `src/lib/dealLossService.mjs`
- `src/store/useCRMStore.ts`
- `tests/deal-loss-reasons.test.ts`

## Change Log

- 2026-08-11: Story criada para capturar e analisar perdas sem nova aba.
- 2026-08-11: Implementacao concluida, migrations remotas aplicadas e story movida para Ready for Review.
