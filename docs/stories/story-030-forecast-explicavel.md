# Story 030 - Forecast comercial explicavel

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@architect`
- Apoio: `@data-engineer`, `@qa`

## Story

Como operador comercial, quero prever receita com base em evidencias do funil,
para distinguir expectativa, risco e receita provavel sem depender de uma
porcentagem manual ou otimista.

## Contexto

Deals ja possuem valor, probabilidade, etapa, recorrencia, data de fechamento e
eventos comerciais. A previsao precisa combinar esses dados com saude e
qualificacao, mostrando a formula e os motivos de cada resultado.

O agregado entra em `Funis` e na `Sala de Comando`; a explicacao individual entra
no overlay do `Pipeline`. Nenhuma aba nova sera criada.

## Dependencias

- Stories 027, 028 e 029 concluidas.
- Preservar a separacao existente entre receita one-off e MRR.

## Acceptance Criteria

- [ ] O sistema calcula pipeline bruto, pipeline ponderado, receita provavel no
  periodo, MRR provavel e receita one-off provavel separadamente.
- [ ] A probabilidade calculada considera etapa e evidencias disponiveis de saude,
  qualificacao, resposta, decisor, reuniao, proposta, recencia e data de fechamento.
- [ ] A formula, pesos e versao sao deterministicas, documentadas e testadas; IA
  nao define o numero final.
- [ ] Cada deal apresenta probabilidade calculada, nivel de confianca, fatores que
  aumentam/reduzem a previsao e dados faltantes.
- [ ] Probabilidade manual existente nao e apagada; quando divergir da calculada,
  ambas aparecem identificadas e a fonte usada no agregado e explicita.
- [ ] Deals `won` entram em realizado, `lost` nao entram no forecast e deals sem
  valor/data recebem tratamento explicito sem numero inventado.
- [ ] Funis exibe os agregados e suas taxas sem misturar realizado com previsto.
- [ ] Sala de Comando exibe receita em risco, receita sem proxima acao e negocios
  relevantes para o periodo, reutilizando os componentes atuais.
- [ ] Pipeline mostra a explicacao individual sem criar coluna ou etapa adicional.
- [ ] Existe comando CLI que calcula o forecast para periodo e filtros informados,
  com modo de verificacao sem persistencia.
- [ ] A navegacao existente permanece inalterada; nenhuma rota ou aba nova e criada.
- [ ] Testes cobrem MRR/one-off, manual versus calculada, sem data, sem valor,
  ganho, perdido e queda de confianca por dados ausentes.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir formula versionada, confianca e politicas de inclusao (AC: 1-6).
- [x] Escrever testes RED do dominio de forecast (AC: 1-6, 12).
- [x] Implementar calculo puro, consulta server-side e comando CLI (AC: 3, 10).
- [x] Integrar agregados ao Funil e Sala de Comando (AC: 7, 8, 11).
- [x] Integrar explicacao ao overlay do Pipeline (AC: 4, 5, 9).
- [x] Validar que receita realizada, prevista, MRR e one-off nao se misturam (AC: 1, 6, 7).
- [x] Executar regressao e quality gates (AC: 12, 13).
- [x] Atualizar checklist, Dev Agent Record e File List desta story.

## Fora de Escopo

- Nova aba de forecast.
- Modelo estatistico treinado com historico insuficiente.
- IA atribuindo probabilidade final.
- Metas ou precos novos.
- Snapshot historico avancado e comparacao de versoes mensais.

## Dev Notes

- `src/lib/crmRecords.ts` ja mapeia `value`, `prob`, `recurring`, `close` e `closedAt`.
- `src/lib/funnelMetrics.ts` separa MRR de receita one-off e e a referencia para
  calculos puros e taxas sem divisao invalida.
- `src/app/funil/page.tsx`, `src/app/comando/page.tsx` e
  `src/app/pipeline/page.tsx` sao as unicas superficies de UI previstas.
- O forecast deve declarar claramente a fonte da probabilidade agregada.

## Testing

- Testes unitarios com valores exatos para cada regra e arredondamento.
- Testes de invariantes: forecast nunca negativo; `lost` sempre zero; realizado
  nao aparece como previsto; one-off nunca entra em MRR.
- Teste de API/CLI com filtros de periodo.
- Smoke visual dos agregados e explicacoes nas telas existentes.

## CodeRabbit Integration

- Tipo: Data + Full-stack; complexidade alta.
- Pre-Commit `@dev`: precisao numerica, invariantes e explicabilidade.
- Pre-PR `@devops`: compatibilidade de contratos e regressao do funil.
- Self-healing: `@dev` light, ate 2 iteracoes/15 min, auto-fix apenas CRITICAL.

## Dev Agent Record

### Agent Model Used

- Codex (GPT-5)

### Debug Log References

- RED confirmado: `ERR_MODULE_NOT_FOUND` para `src/lib/dealForecast.mjs` antes da implementacao.
- RED de regressao: `deal_health_score = null` era interpretado como zero; corrigido para dado ausente.
- CodeRabbit CLI nao executado: Windows sem distribuicao WSL instalada (graceful degradation configurada).

### Completion Notes List

- Formula `commercial_forecast` v1 publica, deterministica e documentada; IA nao participa do numero.
- Agregados usam exclusivamente `calculated_v1`; probabilidade manual permanece intacta e comparavel no Pipeline.
- Pipeline bruto/ponderado, previsto do periodo, MRR, one-off e realizado permanecem separados.
- Deals sem valor/data geram avisos e receita zero; ganhos entram em realizado e perdidos ficam excluidos.
- Funis, Sala de Comando e overlay do Pipeline foram ampliados sem nova rota de pagina, aba, coluna ou etapa.
- CLI `npm run forecast:deals -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--deal-id=N] [--stage=...]` e somente leitura.
- Self-critique: 2 problemas encontrados e corrigidos (saude nula e duplicacao de pesos fora da rubrica).
- Gates finais: lint PASS; typecheck PASS; testes 131/131 PASS; build 59/59 paginas PASS; `git diff --check` PASS.
- Smoke interativo em navegador nao executado por indisponibilidade de browser local; contratos de UI, compilacao e build foram validados.

### File List

- `docs/plans/2026-08-11-forecast-explicavel-design.md`
- `docs/plans/2026-08-11-forecast-explicavel.md`
- `docs/stories/story-030-forecast-explicavel.md`
- `package.json`
- `scripts/deal-forecast.mjs`
- `src/app/api/comando/route.ts`
- `src/app/api/funnel/route.ts`
- `src/app/comando/page.tsx`
- `src/app/funil/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/dealForecast.d.mts`
- `src/lib/dealForecast.mjs`
- `src/lib/dealForecastService.d.mts`
- `src/lib/dealForecastService.mjs`
- `tests/deal-forecast.test.ts`

## Change Log

- 2026-08-11: Story criada para forecast explicavel nas telas existentes.
- 2026-08-11: Formula v1, agregados, CLI read-only e integracoes em Funis, Comando e Pipeline implementados e validados.
