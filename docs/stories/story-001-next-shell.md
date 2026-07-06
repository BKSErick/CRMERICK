# Story 001 - Next.js shell e API segura inicial

## Status
Ready for Dev

## Story
Como operador do CRM Erick, quero abrir o sistema em uma base Next.js com layout unico e rotas nativas, para iniciar a migracao sem depender do iframe-orquestrador legado.

## Acceptance Criteria
- [x] O app Next.js exibe um layout unico com sidebar, topbar e conteudo ativo.
- [x] A navegacao principal usa rotas do Next.js em vez de troca de iframes.
- [x] Existe uma store tipada para deals e contacts preparada para sincronizacao reativa.
- [x] Existe uma rota server-side `/api/instagram` que le tokens apenas de variaveis de ambiente.
- [x] A home inicial usa metricas derivadas da store/mock local, sem hardcode de token.
- [x] O sistema legado HTML permanece intacto durante esta primeira migracao.

## Tasks / Subtasks
- [x] Criar shell visual do CRM no Next.js.
- [x] Criar componentes compartilhados de navegacao.
- [x] Criar store reativa base.
- [x] Criar API route server-side para Instagram.
- [x] Criar rotas placeholder para modulos ainda nao migrados.
- [x] Executar quality gates aplicaveis.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `npm run lint`
- `npm run build`

### Completion Notes List
- Migracao inicial mantem HTML legado em paralelo.
- Tokens do Instagram foram isolados na API route server-side do Next.
- Rotas dos modulos foram criadas com placeholders operacionais para migracao incremental.

### File List
- `docs/stories/story-001-next-shell.md`
- `src/app/api/instagram/route.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/[module]/page.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Topbar.tsx`
- `src/components/ModulePlaceholder.tsx`
- `src/lib/navigation.ts`
- `src/store/useCRMStore.ts`

### Change Log
- 2026-07-06: Criado shell inicial Next.js, API Instagram server-side e store CRM base.
