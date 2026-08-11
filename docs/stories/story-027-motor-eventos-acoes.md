# Story 027 - Motor central de eventos e acoes comerciais

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@architect`
- Apoio: `@data-engineer`, `@qa`

## Story

Como operador comercial, quero centralizar os eventos, regras e resultados das
automacoes do CRM, para que cada proxima acao seja previsivel, auditavel e
executada sem espalhar logica por webhooks, scripts e telas.

## Contexto

O CRM ja calcula cadencias, recebe mensagens da Uazapi, registra atividades,
classifica respostas, agenda proximas acoes e executa prospeccao com dry-run. A
evolucao desta story e criar uma camada unica `evento -> condicao -> acao`, sem
substituir os guards existentes e sem transformar IA em autoridade operacional.

Esta story nao cria rota ou aba. Configuracao simples usa `Configuracoes`; a fila
operacional permanece na `Sala de Comando`; o resultado por oportunidade aparece
no `Pipeline` e em sua timeline.

## Dependencias

- Stories 020, 021, 022, 025 e 026 concluidas.
- Preservar `src/lib/followup.ts`, o webhook Uazapi e o runner aprovado como
  fontes dos comportamentos existentes ate a migracao ser validada.

## Acceptance Criteria

- [ ] Existe um contrato unico e versionado para evento comercial, regra,
  condicao, acao e resultado de execucao.
- [ ] Sao aceitos, no minimo, eventos de mensagem recebida/enviada, mudanca de
  etapa, atualizacao de score, vencimento de proxima acao e status de reuniao.
- [ ] A primeira versao permite somente acoes seguras: criar/atualizar tarefa,
  alterar prioridade, gerar rascunho, registrar alerta e solicitar confirmacao.
- [ ] Nenhuma regra envia mensagem, move etapa ou altera dado comercial sensivel
  sem confirmacao explicita nesta primeira versao.
- [ ] A engine e deterministica, idempotente e registra regra, versao, entrada,
  resultado, data e motivo de ignorar/falhar.
- [ ] Existe modo CLI de simulacao que lista o que seria executado sem gravar
  dados, e modo de aplicacao explicito com resumo final.
- [ ] Regras manuais e dados corrigidos pelo operador prevalecem sobre sugestoes
  automaticas, seguindo o comportamento atual de `next_action_source`.
- [ ] `Configuracoes` permite visualizar, ativar e desativar regras existentes;
  nao existe builder visual generico nesta story.
- [ ] `Sala de Comando` mostra alertas/tarefas produzidos pela engine e o
  `Pipeline` registra o resultado na timeline do deal.
- [ ] A navegacao existente permanece inalterada; nenhuma rota ou aba nova e criada.
- [ ] Webhook e runner existentes passam a publicar/consumir o contrato central
  sem duplicar a decisao comercial em caminhos paralelos.
- [ ] Migration e schema local sao aditivos, sincronizados e preservam os dados atuais.
- [ ] Testes cobrem idempotencia, precedencia manual, dry-run, falha parcial,
  regra desativada e proibicao de envio/movimento automatico.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir o contrato de eventos, regras, acoes e execucoes (AC: 1, 2, 5).
- [x] Escrever testes RED da engine deterministica e dos limites de autoridade (AC: 3-7).
- [x] Criar migration aditiva e repositorio server-side com RLS adequada (AC: 5, 12).
- [x] Implementar comando CLI com `--dry-run` padrao e aplicacao explicita (AC: 6).
- [x] Adaptar webhook, deals, reunioes e runner para o contrato central (AC: 2, 11).
- [x] Integrar a gestao minima em Configuracoes, Comando e timeline do Pipeline (AC: 8-10).
- [x] Executar testes de regressao e quality gates (AC: 13, 14).
- [x] Atualizar checklist, Dev Agent Record e File List desta story.

## Fora de Escopo

- Nova aba de automacoes.
- Builder no-code de fluxos complexos.
- Disparo frio automatico no Instagram.
- IA escolhendo destinatarios, enviando mensagens ou movendo etapas.
- Substituir os guards de horario, opt-out, limites, canal e aprovacao existentes.

## Dev Notes

- A engine atual de follow-up e compartilhada por CLI, API e UI e declara que nao
  envia mensagens nem move etapas: `src/lib/followup.ts`.
- `src/app/api/webhooks/uazapi/route.ts` ja respeita valores manuais de resposta e
  proxima acao.
- `src/app/api/deals/route.ts` registra alteracoes operacionais em atividades.
- `scripts/prospeccao-runner.mjs` e a referencia de lock, heartbeat, resumo e
  dry-run seguro.
- `src/app/comando/page.tsx`, `src/app/configuracoes/page.tsx` e
  `src/app/pipeline/page.tsx` sao as superficies existentes desta story.
- O repositorio nao possui arquitetura sharded propria; usar o codigo, as stories
  020-026 e `scripts/supabase-schema.sql` como fontes locais de verdade.

## Testing

- Testes unitarios da avaliacao de condicoes e geracao de acoes.
- Testes de integracao das rotas e persistencia, incluindo RLS e erros parciais.
- Teste de regressao garantindo zero chamada de envio ou movimento automatico.
- Smoke CLI em dry-run com eventos representativos e nenhum efeito colateral.

## CodeRabbit Integration

- Tipo: Architecture + Database + API; complexidade alta.
- Pre-Commit `@dev`: contratos, idempotencia, seguranca e regressao.
- Pre-PR `@devops`: compatibilidade com webhook/runner e migration aditiva.
- Pre-Deployment `@devops`: backup/rollback, RLS e dry-run remoto.
- Self-healing: `@dev` light, ate 2 iteracoes/15 min, auto-fix apenas CRITICAL.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED inicial: `node --test --experimental-strip-types tests/commercial-automation.test.ts` falhou por modulo ainda inexistente.
- GREEN focado: 9/9 testes do motor; regressao final: 96/96 testes.
- Quality gates: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` aprovados.
- CodeRabbit CLI nao executado: a maquina nao possui distribuicao WSL nem binario Windows disponivel; revisao estatica manual e `git diff --check` foram executados.

### Completion Notes List

- Contrato v1 centraliza seis eventos comerciais e limita a execucao a cinco acoes seguras.
- Persistencia registra eventos, regras versionadas, resultados, skips/falhas e chaves idempotentes com RLS deny-by-default.
- Webhook, deals, calendario e runner publicam/consomem o contrato sem envio automatico ou movimento de etapa.
- Acoes e prioridades manuais prevalecem; prioridade ganhou origem `automatic`/`manual` com backfill conservador.
- Configuracoes, Sala de Comando e timeline do Pipeline foram reutilizadas; nenhuma pagina, rota de tela ou aba principal foi criada.
- Migration foi criada e validada estaticamente, mas nao foi aplicada a banco remoto nem publicada nesta story.

### File List

- `docs/stories/story-027-motor-eventos-acoes.md`
- `package.json`
- `scripts/commercial-automation.mjs`
- `scripts/migrations/20260811_commercial_automation_engine.sql`
- `scripts/prospeccao-runner.mjs`
- `scripts/supabase-schema.sql`
- `src/app/api/calendar/route.ts`
- `src/app/api/comando/route.ts`
- `src/app/api/deals/route.ts`
- `src/app/api/webhooks/uazapi/route.ts`
- `src/app/comando/page.tsx`
- `src/app/configuracoes/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/commercialAutomation.d.mts`
- `src/lib/commercialAutomation.mjs`
- `src/lib/commercialAutomationService.d.mts`
- `src/lib/commercialAutomationService.mjs`
- `src/lib/crmRecords.ts`
- `tests/commercial-automation.test.ts`
- `tests/deal-deletion.test.ts`

## Change Log

- 2026-08-11: Story criada a partir do benchmark do FlowCRM, sem nova aba.
- 2026-08-11: Motor comercial v1 implementado e validado, pronto para revisao; migration remota e deploy permanecem fora deste fechamento local.
