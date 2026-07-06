# Story 005 - Migracao dos modulos restantes

## Status
Draft

## Story
Como Erick, quero que todos os atalhos principais do CRM abram rotas React nativas, para encerrar a dependencia operacional do orquestrador por iframes.

## Acceptance Criteria
- [ ] Pipeline possui kanban React com mudanca de etapa e criacao local de deals, preservando a base visual do HTML legado.
- [ ] Contatos possui lista React com filtros e criacao local de contatos, preservando a base visual do HTML legado.
- [ ] Instagram consome `/api/instagram` e mostra fallback claro quando nao ha credenciais, preservando a base visual do HTML legado.
- [ ] Conteudo possui painel React baseado em dados de Instagram quando disponiveis, preservando a base visual do HTML legado.
- [ ] Disparo possui fila React com links de WhatsApp derivados de contatos/deals, preservando a base visual do HTML legado.
- [ ] Demais modulos deixam de ser placeholders apenas quando tiverem paridade visual aceitavel com o legado.
- [ ] Todas as rotas principais do menu sao marcadas como migradas somente apos port real.
- [ ] Quality gates aplicaveis passam.

## Tasks / Subtasks
- [x] Expandir store CRM com campos e acoes locais.
- [x] Migrar Pipeline com paridade visual.
- [ ] Migrar Contatos com paridade visual.
- [ ] Migrar Instagram com paridade visual.
- [ ] Migrar Conteudo com paridade visual.
- [ ] Migrar Disparo com paridade visual.
- [ ] Converter modulos estaticos restantes com paridade visual.
- [ ] Executar lint e build.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `npm.cmd run lint`
- `npm.cmd run build`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/pipeline`
- `Invoke-RestMethod -Uri http://127.0.0.1:3000/api/crm-data`

### Completion Notes List
- A migracao restante deve preservar a base visual do legado; nao marcar rotas como migradas com telas genericas.
- O legado HTML permanece no repositorio para comparacao e rollback visual.
- O Pipeline agora usa `src/styles/legacy-pipeline.css`, extraido de `modules/pipeline.html`, como camada de design system legado.
- A rota `/api/crm-data` carregou 942 deals e 942 contatos a partir de `js/mock-db.js`.
- O topo do Pipeline foi simplificado para manter breadcrumb/search no Topbar e deixar apenas filtros + botao `Novo deal` acima do kanban.

### File List
- `docs/stories/story-005-migracao-modulos-restantes.md`
- `src/app/conteudo/page.tsx`
- `src/app/contacts/page.tsx`
- `src/app/disparo/page.tsx`
- `src/app/instagram/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/app/[module]/page.tsx`
- `src/components/ModulePlaceholder.tsx`
- `src/lib/navigation.ts`
- `src/store/useCRMStore.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/styles/README.md`
- `src/styles/legacy-pipeline.css`
- `scripts/extract-legacy-pipeline-css.js`

### Change Log
- 2026-07-06: Criadas rotas React para todos os modulos restantes do menu.
- 2026-07-06: Extraido o design system legado do Pipeline e alinhados cards/modal React aos nomes de classe originais.
- 2026-07-06: Removidos header, KPIs e formulario aberto do topo do Pipeline; criacao de deal agora abre por botao.
