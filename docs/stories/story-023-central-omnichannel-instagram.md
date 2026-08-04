# Story 023 - Central Omnichannel com Prospeccao Instagram

## Status

Ready for Review

## Story

Como Erick, quero receber no CRM somente clinicas odontologicas e de estetica ja
pesquisadas e revisadas, registrar minhas mensagens e acompanhar follow-ups no mesmo
deal, para operar um novo canal sem duplicar leads nem perder o historico comercial.

## Contexto

- Design aprovado em `docs/plans/2026-08-04-central-omnichannel-instagram-design.md`.
- A aba Instagram atual exibe somente metricas da conta do Erick.
- Serper Maps ja alimenta o CRM por script local.
- `messages.channel` ja aceita `instagram`.
- O motor atual de follow-up e global ao WhatsApp e precisa ser isolado por canal.
- Industrial permanece no fluxo atual e nao entra na busca Instagram desta story.

## Acceptance Criteria

- [x] A aba Instagram preserva a visao geral atual e oferece modos Achados e Leads e follow-ups.
- [x] A busca server-side aceita cidade, UF e apenas as verticais Odontologia ou Estetica.
- [x] A busca usa Serper sem expor chaves ao cliente e falha claramente quando nao configurada.
- [x] Resultados exibem as evidencias reais disponiveis e nunca afirmam atividade nao confirmada.
- [x] A deduplicacao por CID, telefone, nome, dominio e deal existente ocorre antes da importacao.
- [x] Empresa existente recebe o canal Instagram no mesmo deal; empresa nova cria um unico deal.
- [x] Industrial existente nao e migrado, removido nem reclassificado automaticamente.
- [x] Estado operacional e cadencia sao persistidos por `deal + channel`.
- [x] `messages` registra conteudo, direcao, status e horario das DMs confirmadas.
- [x] `activities` diferencia perfil aberto de envio confirmado.
- [x] Abrir ou copiar uma mensagem nunca conta como envio.
- [x] Confirmar envio exige gesto explicito e agenda a proxima acao do Instagram.
- [x] Follow-ups Instagram usam D+2, D+5 e D+10 sem interferencia do WhatsApp.
- [x] A interface permite registrar resposta, classificar, agendar, pausar e marcar opt-out.
- [x] Nenhuma mensagem Instagram e enviada automaticamente.
- [x] Clientes e cases bloqueados continuam fora da prospeccao.
- [x] Testes cobrem dominio, API, dedupe, isolamento de canal e regressao opened != sent.
- [x] Lint, typecheck, testes e build passam.
- [x] Smoke visual valida Visao geral, Achados e Leads e follow-ups sem envio externo real.

## Tasks / Subtasks

- [x] Criar testes RED do dominio omnichannel e das consultas permitidas.
- [x] Implementar configuracao de verticais e funcoes puras de match/cadencia.
- [x] Criar migration aditiva de `prospecting_channels`.
- [x] Implementar busca Serper server-side com preview e dedupe.
- [x] Implementar importacao idempotente no deal existente ou novo.
- [x] Implementar acoes auditaveis de abrir, confirmar envio, responder e agendar.
- [x] Reestruturar a aba Instagram nos tres modos aprovados.
- [x] Implementar fila e historico de follow-up por canal.
- [x] Atualizar runbook e configuracao de ambiente.
- [x] Executar quality gates e smoke visual.

## Fora de Escopo

- Envio automatico de cold DM.
- API privada ou automacao de navegador do Instagram.
- Scraping autenticado do Instagram.
- Migracao automatica dos leads industriais existentes para Instagram.
- Meta Ads ou publicacao automatica de conteudo.
- Webhook de inbox Meta sem permissao oficial validada.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm.cmd run lint`: PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd test`: PASS, 64 testes.
- `npm.cmd run build`: PASS, Next.js 16.2.12.
- Migration via Supabase Management API: HTTP 201; leitura REST da tabela: HTTP 200.
- Smoke visual: Visao geral, Achados e Leads e follow-ups validados em instancia isolada; nenhum envio externo executado.
- Testes direcionados da copy: PASS, 8 testes; personalizacao por nome e elogio coberta no gerador e na fila.
- Backfill Supabase: 50/50 rascunhos atualizados, Dra. Renata validada e 0 mensagens enviadas.
- Regressao da fila: Clinica Elevata e Clinica AMA retornam a copy persistida nova; copy antiga ausente.

### Completion Notes List

- Busca limitada a odontologia e estetica; industrial preservado no fluxo atual.
- Pesquisa operada comigo em lotes pequenos; o CRM recebe apenas achados revisados.
- Nenhuma rota implementa envio automatico de DM.
- Abrir perfil e copiar mensagem nao criam envio; somente a confirmacao explicita grava `messages`.
- Migration aditiva aplicada e confirmada no projeto Supabase do CRM.
- `SERPER_API_KEYS` ainda precisa ser configurada no ambiente de execucao.
- A abordagem inicial agora comeca por um elogio ao trabalho, conecta essa percepcao ao site e usa os cases reais do Instagram como prova.
- Evidencias do lead podem guardar `recipientName` e `compliment`; a fila e os novos rascunhos reaproveitam esses dados sem automatizar o envio.
- `Mensagem sugerida` agora prioriza o rascunho persistido, eliminando a divergencia entre o texto validado no banco e o texto exibido na interface.

### File List

- `docs/plans/2026-08-04-central-omnichannel-instagram-design.md`
- `docs/plans/2026-08-04-central-omnichannel-instagram.md`
- `docs/stories/story-023-central-omnichannel-instagram.md`
- `docs/RUNBOOK-prospeccao.md`
- `.env.example`
- `scripts/migrations/20260804_prospecting_channels.sql`
- `scripts/smoke-instagram-visual.mjs`
- `scripts/supabase-schema.sql`
- `src/app/api/prospecting/route.ts`
- `src/app/api/prospecting/actions/route.ts`
- `src/app/api/prospecting/import/route.ts`
- `src/app/api/prospecting/search/route.ts`
- `src/app/instagram/InstagramFollowups.tsx`
- `src/app/instagram/InstagramProspecting.tsx`
- `src/app/instagram/page.tsx`
- `src/lib/prospecting.ts`
- `src/lib/prospectingActions.ts`
- `src/lib/prospectingApi.ts`
- `src/lib/prospectingRecords.ts`
- `src/lib/prospectingRepository.ts`
- `src/lib/prospectingSearch.ts`
- `src/lib/prospectingSearchServer.ts`
- `src/lib/serper.ts`
- `src/styles/hub.css`
- `tests/instagram-prospecting-ui.test.ts`
- `tests/prospecting-actions.test.ts`
- `tests/prospecting-api.test.ts`
- `tests/prospecting-operations.test.ts`
- `tests/prospecting-records.test.ts`
- `tests/prospecting-routes.test.ts`
- `tests/prospecting-search.test.ts`
- `tests/serper-client.test.ts`

## Change Log

- 2026-08-04: Design aprovado para central omnichannel, com nova busca Instagram
  limitada a odontologia e estetica e preservacao do fluxo industrial atual.
- 2026-08-04: Fluxo ajustado para pesquisa externa curada, aba Achados e smoke visual completo.
- 2026-08-04: Copy inicial revisada com Webson para elogio primeiro, prova por cases do Instagram e personalizacao por lead; 50 rascunhos atualizados sem envio.
- 2026-08-04: Corrigida fonte de verdade da fila para exibir o rascunho persistido; adicionada regressao que impede a copy recalculada de sobrescrever a revisada.
