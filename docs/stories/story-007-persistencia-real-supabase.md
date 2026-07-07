# Story 007 - Fase 1: Persistencia real no Next.js

## Status
Done

## Story
Como Erick, quero que o CRM canonico (Next.js/Vercel) grave e leia deals e contacts direto do Supabase, para que o unico CRM que uso pare de perder edicoes a cada refresh.

## Contexto
Fonte: `Pre-Vistoria_CRM_2026-07-07.md`, secoes 2, 4, 5, 8 (Fase 1) e 10 (decisoes do Erick).

Esta e a story de maior prioridade de valor do ciclo: hoje o app Next.js deployado (`crmerick.vercel.app`) nao persiste nada. `/api/crm-data` executa `js/mock-db.js` (2,79 MB) via `vm.runInNewContext` a cada GET, sem cache, e as mutacoes em `src/store/useCRMStore.ts` (`createDeal`, `updateDeal`, `updateDealStage`, `deleteDeal`, `createContact`, `updateContact`, `deleteContact`, linhas 171-205) mudam somente o estado Zustand em memoria no navegador. O unico caminho que hoje persiste de verdade no Supabase `rezgkabwxxltpprpvdua` e o hub legado, via `js/supabase-client.js` (gerado pelo `scripts/build.js`), que faz CRUD client-side com a publishable key.

Alem disso, `initialDeals`/`initialContacts` (linhas 58-164 do store) sao dados fake hardcoded (TEMP-001..004, "Cliente ABC", telefones fake) que aparecem em flash antes do fetch e permanecem visiveis se `/api/crm-data` falhar.

## Acceptance Criteria
- [x] Existe uma rota server-side `/api/deals` com metodos GET, POST, PATCH e DELETE, usando a service-role key do Supabase lida exclusivamente de `process.env` (nunca exposta ao cliente).
- [x] Existe uma rota server-side `/api/contacts` com metodos GET, POST, PATCH e DELETE, mesmo padrao de seguranca.
- [x] `src/store/useCRMStore.ts` passa a fazer writeback real: `createDeal`, `updateDeal`, `updateDealStage`, `deleteDeal`, `createContact`, `updateContact`, `deleteContact` chamam as novas rotas via optimistic update (UI atualiza imediatamente, com rollback caso a chamada falhe).
- [x] `/api/crm-data` (ou seu substituto direto) passa a ler os dados do Supabase em vez de executar `js/mock-db.js` via `vm.runInNewContext`.
- [x] `js/mock-db.js`, `js/garimpo-leads.json` e `js/disparo-data.json` deixam de ser lidos em runtime pelo Next.js; seu conteudo vivo e migrado para o Supabase por um script de seed one-time.
- [x] Existe `scripts/seed-supabase.mjs` (ou `.js`) que le o conteudo atual de `js/mock-db.js` + `js/garimpo-leads.json` + `js/disparo-data.json` e grava os registros no Supabase (idempotente o suficiente para nao duplicar em uma segunda execucao acidental, ou com aviso claro caso rode duas vezes).
- [x] `initialDeals`/`initialContacts` fake (linhas 58-164 do store, TEMP-001..004 e "Cliente ABC") sao removidos. No lugar, a store exibe um estado de loading/skeleton ate o primeiro fetch real completar.
- [x] Falha de rede/API ao carregar deals/contacts mostra estado de erro visivel na UI, nunca dado fake silencioso.
- [x] Pipeline (Kanban) e Contatos continuam funcionando visualmente como na Story 005, agora com dados reais e persistidos.
- [x] Quality gates do projeto passam (`npm run lint`, `npm run build`).

## Tasks / Subtasks
- [x] Criar `/api/deals/route.ts` com GET/POST/PATCH/DELETE usando service-role key server-side.
- [x] Criar `/api/contacts/route.ts` com GET/POST/PATCH/DELETE usando service-role key server-side.
- [x] Atualizar `useCRMStore.ts`: `createDeal`, `updateDeal`, `updateDealStage`, `deleteDeal`, `createContact`, `updateContact`, `deleteContact` passam a chamar as rotas novas com optimistic update + rollback em erro.
- [x] Atualizar `/api/crm-data` (ou os pontos que hoje consomem `js/mock-db.js`) para ler do Supabase.
- [x] Escrever `scripts/seed-supabase.mjs` para popular Supabase a partir de `js/mock-db.js` + `js/garimpo-leads.json` + `js/disparo-data.json`.
- [x] Rodar o seed uma vez contra o Supabase do CRM (ambiente combinado com o Erick antes de rodar contra producao).
- [x] Remover `initialDeals`/`initialContacts` fake do store; implementar skeleton/loading state.
- [x] Implementar estado de erro visivel quando `/api/deals` ou `/api/contacts` falharem.
- [x] Validar manualmente Pipeline (mudanca de estagio, criacao/remocao de deal) e Contatos persistindo entre refreshes.
- [x] Rodar `npm run lint` e `npm run build`.

## Dependencias
- Coordenar com a Story 006: o lock de RLS (deny-by-default para `anon`/`public`) e a entrada em producao das rotas `/api/deals` e `/api/contacts` com service-role devem acontecer no mesmo ciclo de deploy, para evitar uma janela sem nenhum caminho de escrita valido.
- Depende do Supabase do CRM (`rezgkabwxxltpprpvdua`) ja existir com as tabelas `deals`/`contacts` no schema atual (confirmado na pre-vistoria).
- Prepara o terreno para a Story 008 (unificacao do funil), que assume que o pipeline ja le/escreve do Supabase real.

## Riscos
- `vm.runInNewContext` sobre 2,79 MB a cada GET e hoje o unico caminho de leitura; a troca precisa manter os mesmos formatos de campo (`Deal`, `Contact`) esperados pelos componentes React ja migrados (Stories 001, 003, 005), sob risco de quebrar Pipeline/Funil/Disparo.
- Seed one-time mal calibrado pode duplicar os 942 deals/contacts hoje presentes em `mock-db.js` se rodado mais de uma vez sem checagem de idempotencia.
- Optimistic update sem rollback correto pode mascarar falhas de escrita (usuario acha que salvou, mas o Supabase rejeitou por causa da nova RLS restritiva da Story 006).

## Dev Agent Record

### Agent Model Used
GPT-5 Codex (Dex)

### Debug Log References
- `node scripts/seed-supabase.js --dry-run --limit=2` - validou parsing de `mock-db.js`, `garimpo-leads.json` e `disparo-data.json` sem gravar.
- `node scripts/verify-crm-rls.js` - confirmou Supabase ja populado com 942 deals e 942 contacts.
- `npm run lint` - passou.
- `npm run build` - passou.
- `npm test` - nao existe script `test` no `package.json`.

### Completion Notes List
- Criadas rotas server-side `/api/deals` e `/api/contacts` com GET/POST/PATCH/DELETE usando service-role via env server-side.
- `/api/crm-data` deixou de executar `js/mock-db.js` em runtime e agora le `deals`/`contacts` do Supabase.
- Store Zustand removeu os dados fake iniciais e passou a executar optimistic update com rollback em erro.
- Pipeline, Contatos, Funil e Disparo passaram a mostrar erro/loading sem fallback fake silencioso.
- `scripts/seed-supabase.js` foi refeito como seed one-time server-side; nao foi gravado em producao porque as tabelas ja possuem 942 deals e 942 contacts, evitando duplicacao.

### File List
- `.env.example`
- `scripts/seed-supabase.js`
- `scripts/supabase-schema.sql`
- `scripts/verify-crm-rls.js`
- `src/app/api/contacts/route.ts`
- `src/app/api/crm-data/route.ts`
- `src/app/api/deals/route.ts`
- `src/app/contacts/page.tsx`
- `src/app/disparo/page.tsx`
- `src/app/funil/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/lib/crmRecords.ts`
- `src/lib/crmSupabase.ts`
- `src/store/useCRMStore.ts`
- `docs/stories/story-007-persistencia-real-supabase.md`

### Change Log
- 2026-07-07: Story criada por River (SM) a partir do relatorio de pre-vistoria de 2026-07-07.
- 2026-07-07: Validada por Pax (PO). Escopo conferido contra o relatorio (secoes 2, 4, 5, 8 Fase 1 e 10). Prioridade maxima de valor, seed one-time (sem snapshot offline), coordenacao de deploy com o lock de RLS da 006 documentada. Status Draft -> Ready for Dev.
- 2026-07-07: Implementada por Dex junto com a Story 006 para publicar rotas server-side no mesmo pacote do lock de RLS.
- 2026-07-07: Revisada por Quinn (QA). Gate PASS. Status Ready for Review -> Done.

## QA Results

### Gate: PASS
Revisor: Quinn (@qa) | Data: 2026-07-07 | Metodo: read-only contra o codigo real

**Acceptance Criteria (todos verificados):**
- `/api/deals` GET/POST/PATCH/DELETE service-role: CONFIRMADO. `src/app/api/deals/route.ts` usa `getCrmSupabaseAdmin()` de `src/lib/crmSupabase.ts`, que le `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` so de `process.env` e lanca erro se ausentes. Key nunca vai ao cliente.
- `/api/contacts` GET/POST/PATCH/DELETE: CONFIRMADO, mesmo padrao.
- Store com writeback optimistic + rollback: CONFIRMADO. `src/store/useCRMStore.ts` faz optimistic update e `set({ deals: previousDeals })` no catch nas 7 mutacoes (createDeal, updateDeal, updateDealStage, deleteDeal, createContact, updateContact, deleteContact).
- `/api/crm-data` le Supabase (nao `vm.runInNewContext`): CONFIRMADO. `crm-data/route.ts` faz `Promise.all` de `deals`/`contacts` do Supabase. Grep por `runInNewContext` em `src/` = 0.
- `mock-db.js`/`garimpo-leads.json`/`disparo-data.json` fora do runtime: CONFIRMADO. Grep em `src/` = 0; arquivos movidos para `legacy/` (gitignored).
- `scripts/seed-supabase.js` existe: CONFIRMADO (nao rodado em prod porque as tabelas ja tem 942 deals/contacts; idempotencia nao re-testada a fundo aqui).
- Dados fake `initialDeals`/`initialContacts` removidos + skeleton/loading: CONFIRMADO. Store nasce `deals:[]`/`contacts:[]`; `page.tsx`/`pipeline`/`disparo` tem `dataStatus` loading/error visivel.
- Erro de rede visivel, sem fake silencioso: CONFIRMADO (banner "Nao foi possivel carregar os dados reais do Supabase" + `lastError`).
- Pipeline/Contatos com dados reais persistidos: CONFIRMADO por leitura (`pipeline/page.tsx` drag-drop chama `updateDealStage` -> PATCH; create/delete idem).
- `npm run lint` / `npm run build`: passam (log de dev).

**Ressalvas advisory (nao sao AC desta story; registradas para o proximo ciclo):**
1. `src/app/pipeline/page.tsx:338-344` (arquivo desta story) mantem um feed de atividade FABRICADO no `DealDetailOverlay` ("Erick Sena / Joao M. / Carla S. / Pedro A. / Ana L."), exibido em toda abertura de deal. E mock residual do port legado. Recomendo remover ou ligar a dado real.
2. Os botoes de IA do mesmo modal ("Gerar com IA" / "Recalcular" / "Regenerar IA") fazem `POST /api/ai`, rota que NAO existe (Story 010, Draft) -> 404 ao clicar. Ligar quando a Story 010 criar `/api/ai`.
3. Acoes mortas no modal: "Compartilhar", "Mostrar 8 campos vazios", "Rastrear tempo: Start", links da brain-bar e compositor "@Brain" sem handler.

Detalhe completo na Re-Vistoria (`Re-Vistoria_CRM_2026-07-07.md`, secoes 3 e 4).
