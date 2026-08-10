# Story 025 - Automacao comercial mensuravel

## Status

Ready for Review

## Story

Como operador comercial, quero que a prospeccao automatica use scripts versionados,
registre a variante enviada, transforme encaminhamentos em tarefas acionaveis e
meça agendamentos e reunioes, para melhorar o funil com dados auditaveis.

## Contexto

- O envio e o follow-up ja funcionam com Uazapi, mas o disparador efetivo nao deixa
  heartbeat ou resumo de execucao em uma fonte unica.
- Copies e oferta aparecem duplicadas em scripts e telas, com valores divergentes.
- O webhook reconhece encaminhamento, mas o vCard ainda depende de extracao manual.
- `calendar_events.done` nao distingue reuniao confirmada, realizada, no-show ou
  cancelada, impedindo medir o fundo do funil.
- O experimento muda apenas a abertura da primeira mensagem; oferta, mecanismo e
  restante da copy permanecem constantes para preservar a leitura do teste.

## Acceptance Criteria

- [x] Existe uma fonte unica versionada para oferta, templates e experimento ativo.
- [x] Cada primeira abordagem recebe variante A/B deterministica e persiste versao
  de copy, versao de oferta, variante e experimento no deal e na atividade.
- [x] Um runner com lock, heartbeat e resumo executa geracao/triagem, primeiro envio
  e follow-up sem permitir duas execucoes simultaneas.
- [x] O modo padrao do runner e dry-run; envio real exige `--go` e respeita os guards
  atuais de horario, limites, opt-out, canal confirmado e resposta humana.
- [x] O webhook extrai vCard valido, persiste nome/telefone do indicado e mantem a
  proxima acao `contactar_responsavel`, sem realizar disparo automatico ao indicado.
- [x] Reunioes possuem status `scheduled`, `confirmed`, `held`, `no_show` ou
  `cancelled`, com transicoes e timestamps consistentes.
- [x] O funil exibe contagens e taxas mensuraveis de abordagem, resposta valida,
  encaminhamento, qualificado, reuniao agendada, realizada, proposta, negociacao e
  venda, sem contar valor one-off como MRR.
- [x] Um relatorio de experimento compara A/B por enviados, respostas validas,
  reunioes realizadas, propostas e vendas sem inventar dados ausentes.
- [x] Migration e schema local permanecem sincronizados e aditivos.
- [x] Testes de regressao, lint, typecheck e build passam.

## Tasks / Subtasks

- [x] Escrever testes RED para playbook, atribuicao A/B e runner.
- [x] Implementar playbook versionado e rastreabilidade no banco/atividades.
- [x] Implementar runner auditavel mantendo dry-run como default.
- [x] Escrever testes RED e automatizar extracao de encaminhamento no webhook.
- [x] Escrever testes RED para status de reuniao e metricas do funil.
- [x] Implementar migration, API, UI e metricas de fundo do funil.
- [x] Implementar relatorio deterministico do experimento.
- [x] Executar quality gates e atualizar esta story.

## Fora de Escopo

- Envio frio automatico por Instagram.
- Alterar precos sem uma unica versao explicita no playbook.
- IA decidindo sozinha quem recebe mensagem ou mudando stages.
- Publicacao, push ou aplicacao da migration no Supabase sem autorizacao separada.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED 1: modulos `salesPlaybook`, `prospeccao-runner` e `funnelMetrics` ausentes.
- RED 2: scripts de envio sem metadados e webhook sem extracao de vCard.
- RED 3: calendario, migration, API de funil e relatorio ainda ausentes.
- RED 4: transicoes de reuniao nao limpavam timestamps obsoletos.
- GREEN: 14 testes focados e 80 testes completos passam.
- `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` passam.
- Dry-run local do gerador produziu uma copy sem gravar arquivos ou dados.
- Primeira tentativa remota recebeu HTTP 401 com o token anterior; apos autorizacao
  e token renovado, a migration foi aplicada com sucesso pela Management API.
- Verificacao read-only do relatorio A/B confirmou os novos campos no Supabase;
  a amostra inicial ficou corretamente em zero para A e B.

### Completion Notes List

- Oferta operacional consolidada em R$ 1.000 de implantacao + R$ 150/mes,
  preservando o preco que ja estava aprovado nos scripts do CRM.
- A/B altera somente a abertura; o restante da mensagem e a oferta ficam constantes.
- Envio real continua exigindo `--go`; nenhum disparo foi executado nesta implementacao.
- vCard vira encaminhamento acionavel, mas o contato indicado continua manual.
- MRR soma apenas deals ganhos marcados como recorrentes; receita one-off fica separada.
- Migration aplicada e verificada no Supabase remoto sem executar disparos.

### File List

- `docs/stories/story-025-automacao-comercial-mensuravel.md`
- `content/sales-playbook.json`
- `package.json`
- `scripts/migrations/20260810_sales_automation_metrics.sql`
- `scripts/prospeccao-runner.mjs`
- `scripts/report-copy-experiment.mjs`
- `scripts/regenerate-copies.js`
- `scripts/supabase-schema.sql`
- `scripts/uazapi-followup-batch.mjs`
- `scripts/uazapi-send-batch.mjs`
- `src/app/api/calendar/route.ts`
- `src/app/api/funnel/route.ts`
- `src/app/api/webhooks/uazapi/route.ts`
- `src/app/calendar/page.tsx`
- `src/app/comando/page.tsx`
- `src/app/funil/page.tsx`
- `src/app/reunioes/page.tsx`
- `src/lib/crmRecords.ts`
- `src/lib/followup.ts`
- `src/lib/funnelMetrics.ts`
- `src/lib/salesPlaybook.mjs`
- `tests/deal-deletion.test.ts`
- `tests/funnel-metrics.test.ts`
- `tests/sales-automation.test.ts`

## Change Log

- 2026-08-10: Story criada a partir da auditoria do funil e da aprovacao do usuario.
- 2026-08-10: Automacao auditavel, copies versionadas, encaminhamentos e funil de reunioes implementados em TDD.
- 2026-08-10: Migration aplicada no Supabase e contrato remoto verificado pelo relatorio A/B.
