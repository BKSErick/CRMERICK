# Story 013 - Limpeza do modal de deal: feed fake, acoes mortas e botoes de IA orfaos

## Status
Ready for Review

## Story
Como Erick, quero o modal de deal do Pipeline sem dados fabricados e sem botoes que nao fazem nada, para que o CRM mostre apenas realidade e a UI nao minta sobre capacidades que ainda nao existem.

## Contexto
Fonte: `Re-Vistoria_CRM_2026-07-07.md` (secao 3 e 4; itens do plano do proximo ciclo).

- `src/app/pipeline/page.tsx:338-344`: feed de atividade FABRICADO (Erick Sena/Carla S./Pedro A./Ana L.) exibido em todo deal como se fosse historico real.
- Botoes "Gerar com IA" e "Recalcular" fazem `POST /api/ai` - rota inexistente (404 silencioso). A rota so nasce na story-010 (Draft, aguardando priorizacao).
- Acoes sem handler no modal: Compartilhar, "Mostrar campos vazios", "Rastrear tempo", brain-bar, compositor "@Brain".
- Existe tabela `activities` real no Supabase (RLS deny-by-default, escrita server-side) - candidata natural a alimentar o feed com dados reais.

## Acceptance Criteria
- [x] O feed de atividade fabricado e removido. No lugar: atividades reais da tabela `activities` via rota server-side (GET por deal), ou estado vazio explicito ("nenhuma atividade registrada") se nao houver dados. Nenhum nome/valor inventado.
- [x] Botoes "Gerar com IA" e "Recalcular" nao chamam mais rota inexistente: ficam ocultos ou desabilitados com indicacao "em breve" ate a story-010 criar `/api/ai`. Nenhum 404 no console ao usar o modal.
- [x] Acoes sem handler (Compartilhar, Mostrar campos vazios, Rastrear tempo, brain-bar, compositor @Brain) sao removidas ou desabilitadas visivelmente - nenhum elemento clicavel que nao faz nada silenciosamente.
- [x] Se o feed passar a usar `activities`: criar/gravar atividade real ao mover deal de stage (writeback ja existente na story-007) e uma migration/policy apenas se necessaria, seguindo o padrao server-side.
- [x] `npm run build` e `npm run lint` passam.
- [x] Verificacao em localhost: abrir modal de deal, mover deal de coluna, conferir feed real/vazio e ausencia de 404.

## Tasks / Subtasks
- [x] Remover o array fabricado em `pipeline/page.tsx:338-344`.
- [x] Decidir e implementar: feed real via `activities` (rota GET server-side + registro em mudanca de stage) OU estado vazio; documentar a escolha no Dev Agent Record.
- [x] Ocultar/desabilitar botoes de IA com indicacao clara (sem chamada a `/api/ai`).
- [x] Remover/desabilitar acoes mortas do modal.
- [x] Build + lint + teste manual em localhost.

## Dependencias
- Independente da story-012 (pode rodar em paralelo). Prepara terreno para a story-010 (IA): quando `/api/ai` existir, os botoes reaparecem.

## Riscos
- Registrar atividades em mudanca de stage adiciona escrita nova; manter no padrao server-side da story-007 para nao reabrir brecha de RLS.
- Remover elementos do modal pode afetar layout; validar visualmente em localhost.

## Dev Agent Record

### Agent Model Used
Dex via Claude

### Debug Log References
- `npm run lint` (eslint): PASS, zero erros/warnings.
- `npm run build`: PASS. Nova rota `/api/ai` nao e chamada pelo modal; `/api/activities` registrada como dinamica (f); pipeline prerenderizado.
- Grep de verificacao: `/api/ai` em `src/app/pipeline/page.tsx` = 0 ocorrencias (zero chamadas a rota de IA no modal).

### Completion Notes List
- Removido o array de atividade fabricado (Erick Sena/Carla S./Pedro A./Ana L.) do `DealDetailOverlay`.
- FEED REAL: criada rota server-side `src/app/api/activities/route.ts` (GET por `dealId` + POST insert), lendo/gravando `public.activities` via service-role (RLS deny-by-default segue intacta; escrita/leitura so no servidor). Estado vazio explicito "Nenhuma atividade registrada ainda." quando nao ha linhas.
- WRITEBACK: `store.updateDealStage` agora registra uma atividade `stage_change` apos o move persistir (best-effort: falha ao logar nao reverte nem quebra o move).
- SEM migration/policy nova: a tabela `activities` ja existe no schema (id, deal_id, contact_id, type, description, created_at) e a escrita server-side com service-role dispensa policy anon. Rule 2 respeitada (nenhuma mudanca de schema).
- Acoes mortas removidas: botao "Compartilhar", brain-bar ("@Brain apresentacao/documento/prototipo"), linha "Rastrear tempo: Start", botao "Mostrar 8 campos vazios" + header "Campos", compositor de comentario "@Brain" e os spans decorativos de acao.
- [AUTO-DECISION] Botoes de IA: descobri que a rota `/api/ai` JA EXISTE e e funcional (actions generate-copy/generate-summary, OpenRouter+Groq com fallback, writeback de copy_text). A premissa da story ("rota inexistente / 404 silencioso") estava desatualizada. Como (a) o coordenador exigiu explicitamente "zero chamadas a /api/ai" (duas vezes), (b) o texto literal da AC2 pede botoes desabilitados com "em breve" ate a story-010, e (c) a story-010 segue formalmente em Draft, DESABILITEI os dois botoes ("Em breve", tooltip citando Story 010) e removi as chamadas fetch a `/api/ai`. Os botoes "Copiar" (clipboard local) e o textarea de copy real (deal.copyText do banco) permanecem.
- RECOMENDACAO ao coordenador/Erick: a rota `/api/ai` esta pronta; ao fechar formalmente a story-010, reabilitar os dois botoes (os handlers `handleGenerateCopy`/`handleGenerateSummary` estao no historico do git) - eles ja tinham loading + erro visivel, sem 404. Nao deletei a rota `/api/ai`.

### File List
Criados:
- `src/app/api/activities/route.ts`
Modificados:
- `src/app/pipeline/page.tsx`
- `src/store/useCRMStore.ts`

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir da Re-Vistoria de 2026-07-07 (itens do plano do proximo ciclo) apos ordem do Erick de acionar o dev.
- 2026-07-07: Dex (@dev) removeu o feed fabricado e as acoes mortas do modal, criou a rota server-side /api/activities (feed real + writeback em mudanca de stage) e desabilitou os botoes de IA ("Em breve", zero chamadas a /api/ai). Lint + build PASS. Status -> Ready for Review. Nota: /api/ai ja existe e funciona; recomendo reabilitar os botoes ao fechar a story-010.
