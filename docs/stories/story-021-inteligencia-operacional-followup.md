# Story 021 - Inteligencia Operacional de Follow-up

## Status

Ready for Review

## Story

Como operador comercial, quero visualizar a situacao real de cada conversa e sua
proxima acao, para priorizar respostas e follow-ups sem depender apenas da etapa do
pipeline ou de calculos implicitos.

## Contexto

- O historico auditado separou silencio, bot e resposta humana.
- O mercado observado favorece retomadas D+7 quando a primeira resposta e automatica.
- `whatsapp_sent_sync` nao entra hoje no relogio da fila.
- O pipeline deve continuar representando estado comercial, nao tipo de resposta.
- Design aprovado em `docs/plans/2026-07-30-followup-operacional-design.md`.

## Acceptance Criteria

- [x] Cada deal persiste classificacao editavel: `sem_resposta`, `bot`, `humana`,
  `encaminhamento`, `objecao` ou `perdido`.
- [x] Registros sem classificacao permanecem compativeis como `sem_resposta`.
- [x] Cada deal pode persistir data, tipo e motivo da proxima acao.
- [x] A fila aplica silencio em D+2/D+5/D+10 e bot em D+7/D+14/D+21.
- [x] Proxima acao definida manualmente prevalece sobre recomendacao calculada.
- [x] A fila nao duplica deals e os organiza em Responder agora, Encaminhamentos,
  Bots D+7, Follow-ups vencidos, Aguardando cadencia e Dados inconsistentes.
- [x] Cada item exibe empresa, classificacao, ultima interacao, tempo decorrido,
  proxima acao e motivo.
- [x] Cards do pipeline exibem classificacao e proxima acao sem novas etapas.
- [x] Resumos consideram `whatsapp_sent` e `whatsapp_sent_sync`.
- [x] Telefones brasileiros consideram equivalencia segura com/sem nono digito.
- [x] Dados ausentes ou sem historico sao sinalizados sem associacao arriscada.
- [x] A interface permite abrir WhatsApp, copiar mensagem, classificar e agendar.
- [x] A engine funciona via CLI para listar, classificar e agendar antes da UI.
- [x] Mensagem que menciona outra empresa conhecida e bloqueada para correcao antes
  de abrir o WhatsApp.
- [x] Nenhuma mensagem e enviada automaticamente.
- [x] Testes cobrem dominio, integridade e retrocompatibilidade.
- [x] Lint, typecheck, testes e build passam.

## Tasks / Subtasks

- [x] Criar testes RED do contrato operacional.
- [x] Implementar motor deterministico de classificacao e cadencias.
- [x] Implementar normalizacao segura de telefones.
- [x] Adicionar migration e mapeamento dos novos campos.
- [x] Unificar os tipos de envio no resumo e nos relogios.
- [x] Atualizar ingestao Uazapi sem mover etapa.
- [x] Criar CLI de listagem, classificacao e agendamento.
- [x] Reestruturar fila e acoes rapidas.
- [x] Adicionar badges e resumo no pipeline.
- [x] Executar quality gates e smoke visual.
- [ ] Publicar e confirmar deployment.

## Fora de Escopo

- Disparo automatico ou agendado de WhatsApp.
- Classificacao por IA.
- Mudanca automatica de etapa.
- Novas etapas comerciais.
- Otimizacao estatistica de copies.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED 1: `node --test tests/followup-operations.test.ts` falhou com
  `ERR_MODULE_NOT_FOUND` antes da engine.
- RED 2: resumo ainda ignorava `whatsapp_sent_sync` e os novos campos.
- RED 3: resposta humana ja atendida continuava em `Responder agora`.
- RED 4: prefixo tecnico `[UAZAPI-HISTORY]` vazava para o contexto visual.
- QA inicial: FAIL por clique contado como envio, override manual incompleto,
  bot sem encerramento em D+21 e backfill sem origem da classificacao.
- Correcoes RED/GREEN: clique virou `whatsapp_opened`, stage automatico foi removido,
  fontes manual/automatic foram separadas e bot encerra apos o terceiro follow-up.
- GREEN final: 22 testes passam.
- `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` passam.
- Smoke local: `/disparo`, `/pipeline`, `/api/activities?summary=whatsapp`,
  `/api/crm-data` e `/api/comando` responderam HTTP 200 contra o Supabase real.

### Completion Notes List

- Migration aditiva aplicada via Supabase Management API.
- Backfill alinhado aos 93 comentarios auditados: 7 bots, 5 humanas,
  1 encaminhamento e 911 sem resposta.
- Fila validada via CLI: Responder agora e Encaminhamentos no topo; bots aguardam
  D+7 em 2026-08-05.
- Nenhum envio automatico ou movimento automatico de stage foi introduzido.
- Guard de empresa bloqueia mensagem que cite outra empresa conhecida.

### File List

- `docs/plans/2026-07-30-followup-operacional-design.md`
- `docs/plans/2026-07-30-followup-operacional.md`
- `docs/stories/story-021-inteligencia-operacional-followup.md`
- `package.json`
- `scripts/migrations/20260730_followup_operations.sql`
- `scripts/supabase-schema.sql`
- `scripts/followup-ops.mjs`
- `src/app/comando/page.tsx`
- `src/app/contacts/page.tsx`
- `src/app/api/activities/route.ts`
- `src/app/api/briefing/route.ts`
- `src/app/api/comando/route.ts`
- `src/app/api/deals/route.ts`
- `src/app/api/webhooks/uazapi/route.ts`
- `src/app/disparo/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/crmRecords.ts`
- `src/lib/activityClient.ts`
- `src/lib/followup.ts`
- `src/lib/whatsappPhone.ts`
- `src/styles/hub.css`
- `src/styles/legacy-pipeline.css`
- `tests/followup-operations.test.ts`

## Change Log

- 2026-07-30: Story criada apos aprovacao explicita do design.
- 2026-07-30: Engine, CLI, migration, fila e pipeline implementados e validados.
- 2026-07-30: Bloqueadores do QA corrigidos por causa raiz e cobertos por regressao.
