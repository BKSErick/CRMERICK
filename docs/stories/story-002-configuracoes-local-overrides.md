# Story 002 - Configuracoes com overrides locais

## Status
Ready for Dev

## Story
Como Erick, quero salvar credenciais locais de teste na tela de Configuracoes, para trocar chaves durante desenvolvimento sem editar codigo nem fazer novo deploy.

## Acceptance Criteria
- [x] A rota `/configuracoes` deixa de ser placeholder e exibe uma tela funcional em React.
- [x] A tela salva, carrega e limpa overrides de Supabase e Instagram via `localStorage`.
- [x] A configuracao distingue credenciais de producao via env server-side de overrides locais de teste.
- [x] A rota `/api/instagram` continua usando env por padrao e aceita overrides locais apenas quando enviados pelo cliente.
- [x] A tela permite testar a conexao do Instagram sem expor token hardcoded no codigo.
- [x] O HTML legado permanece intacto.

## Tasks / Subtasks
- [x] Criar pagina React para `/configuracoes`.
- [x] Criar constantes tipadas de localStorage.
- [x] Persistir credenciais e preferencias locais.
- [x] Atualizar API route do Instagram para overrides opcionais.
- [x] Atualizar navegacao para marcar Configuracoes como migrado.
- [x] Executar quality gates aplicaveis.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `npm.cmd run lint`
- `npm.cmd run build`

### Completion Notes List
- Overrides locais sao explicitamente tratados como teste/desenvolvimento.
- Produção continua priorizando variaveis de ambiente no servidor quando nao ha override enviado.
- A tela de Configuracoes agora substitui o placeholder Next.

### File List
- `docs/stories/story-002-configuracoes-local-overrides.md`
- `src/app/api/instagram/route.ts`
- `src/app/configuracoes/page.tsx`
- `src/app/globals.css`
- `src/lib/localConfig.ts`
- `src/lib/navigation.ts`

### Change Log
- 2026-07-06: Migrada rota Configuracoes para React com localStorage e teste server-side de Instagram.
