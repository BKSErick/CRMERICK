# Story 049 - Mydrion CRM Design System

## Status

Ready for Review

## Story

Como operador comercial, quero que todo o CRM ERICK use a identidade visual da
Mydrion, para que o sistema interno represente a marca atual sem perder suas funcoes,
dados e integracoes.

## Dependencias

- Design aprovado em `docs/plans/2026-09-09-mydrion-crm-design-system-design.md`.
- Logo oficial existente em `public/brand/mydrion-contract.svg`.
- Alteracoes locais das Stories 046-048 devem ser preservadas.

## Acceptance Criteria

1. O checkout e as integracoes continuam sendo os do CRM ERICK.
2. A interface visivel usa `Mydrion CRM` e `Operacao comercial`.
3. Sidebar, topbar e login exibem a identidade oficial da Mydrion.
4. O favicon usa o monograma oficial da Mydrion.
5. O design system usa ink, paper, sand, smoke, Instrument Sans e IBM Plex Mono.
6. O antigo violeta de marca nao permanece em tokens, fallbacks ou componentes visuais.
7. Sidebar, topbar, cards, botoes, campos, tabelas, modais, kanbans e automacoes
   herdam o novo sistema visual.
8. Cores funcionais continuam distinguindo sucesso, alerta, perigo e categorias.
9. A interface continua responsiva e respeita `prefers-reduced-motion`.
10. Teste focado, lint, typecheck, testes, build e revisao visual sao executados.
11. Nenhum commit, push ou deploy ocorre antes da aprovacao no localhost.

## Tasks / Subtasks

- [x] Criar teste RED do contrato visual Mydrion.
- [x] Atualizar marca, metadata, logo e favicon.
- [x] Substituir tokens e componentes base do design system.
- [x] Remover cores e fallbacks violetas remanescentes da interface.
- [x] Executar gates tecnicos e revisao visual responsiva.
- [x] Abrir localhost para aprovacao do usuario.
- [x] Corrigir o overflow decorativo do login encontrado na revisao.
- [x] Distinguir indisponibilidade do Supabase de credencial invalida.
- [x] Revalidar login, scroll desktop/mobile e localhost.

## Fora de Escopo

- Renomear pasta, repositorio Git, projeto Supabase ou integracoes.
- Alterar dados, schema, permissoes, automacoes ou regras comerciais.
- Commit, push ou deploy antes da aprovacao visual.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- `npm.cmd run test:mydrion-design`: 5/5 testes aprovados.
- `npm.cmd run lint`: 0 erros e 2 avisos preexistentes de navegacao interna.
- `npm.cmd run typecheck`: aprovado.
- `npm.cmd run test:email-inbox`: 43/43 testes aprovados.
- `npm.cmd run test:email-automations`: 21/21 testes aprovados.
- `npm.cmd audit --omit=dev --json`: 0 vulnerabilidades de producao.
- `npx.cmd next build --webpack`: build aprovado com 82 rotas.
- `npm.cmd run build`: bloqueado antes do Next por drift preexistente no DNA
  `alex-hormozi`; o build direto acima validou a aplicacao.
- `npm.cmd test`: 385/386 testes aprovados; a unica falha preexistente espera
  `Ficha de Escopo`, enquanto o produto atual usa `Pedido Pronto`.
- Smoke visual autenticado em desktop e mobile: sem overflow horizontal; a
  regressao inicial da sidebar mobile foi corrigida antes da revisao final.
- `node scripts/smoke-login-viewport.mjs`: desktop 1440x900 e mobile 390x844
  sem overflow horizontal ou scroll externo; documento e viewport com dimensoes iguais.
- Probe controlado do endpoint de login retornou 401 para senha propositalmente
  invalida, comprovando que o servidor local voltou a alcancar o Supabase.

### Completion Notes List

- O checkout, as integracoes e os dados continuam sendo os do CRM ERICK.
- A interface visivel agora usa Mydrion CRM, o wordmark oficial e o monograma.
- O sistema visual completo foi atualizado para ink, paper, sand e smoke, com
  Instrument Sans e IBM Plex Mono.
- Sidebar, topbar, login, cards, botoes, campos, tabelas, modais, kanbans e
  automacoes herdam os novos tokens.
- O favicon binario antigo foi removido e substituido por `src/app/icon.svg`.
- O login agora isola o shell do CRM e ignora overflow dos elementos decorativos.
- Falhas de rede do Supabase retornam indisponibilidade 503, sem se passar por
  erro de credencial 401.
- Nenhum commit, push ou deploy foi realizado; a entrega aguarda aprovacao local.

### File List

- `docs/plans/2026-09-09-mydrion-crm-design-system-design.md`
- `docs/plans/2026-09-09-mydrion-crm-design-system.md`
- `docs/stories/story-049-mydrion-crm-design-system.md`
- `package.json`
- `scripts/smoke-login-viewport.mjs`
- `src/app/analise/page.tsx`
- `src/app/api/auth/login/route.ts`
- `src/app/brandbook/page.tsx`
- `src/app/calendar/page.tsx`
- `src/app/disparo/page.tsx`
- `src/app/favicon.ico` (removido)
- `src/app/globals.css`
- `src/app/icon.svg`
- `src/app/insights/page.tsx`
- `src/app/layout.tsx`
- `src/app/login/login.css`
- `src/app/login/page.tsx`
- `src/app/north-star/page.tsx`
- `src/app/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/app/threads/page.tsx`
- `src/components/CopilotPanel.tsx`
- `src/components/DealDetailOverlay.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Topbar.tsx`
- `src/lib/dealPresentation.ts`
- `src/styles/hub.css`
- `src/styles/legacy-pipeline.css`
- `tests/mydrion-design-system.test.ts`
- `tests/admin-auth-routes.test.ts`

## Change Log

- 2026-09-09: Design completo aprovado; Story criada sem autorizar publicacao.
- 2026-09-09: Design system Mydrion implementado e validado; pronto para revisao
  no localhost, ainda sem commit, push ou deploy.
- 2026-09-09: Revisao corrigiu acesso de rede do servidor local, mensagem de
  indisponibilidade do Auth e overflow horizontal/vertical do login.
