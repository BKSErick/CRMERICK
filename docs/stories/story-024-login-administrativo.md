# Story 024 - Login Administrativo do CRM Erick

## Status

Ready for Review

## Story

Como unico operador do CRM, quero entrar com meu e-mail administrativo e um codigo
temporario, para proteger leads, mensagens e operacoes comerciais contra acesso nao
autorizado.

## Contexto

- A necessidade surgiu durante a Story 023, antes de expor novas APIs mutaveis.
- O CRM nao possui hoje middleware, login ou sessao.
- Design aprovado em `docs/plans/2026-08-04-login-administrativo-design.md`.

## Acceptance Criteria

- [x] Existe pagina `/login` responsiva com solicitacao e verificacao de codigo.
- [x] Apenas `CRM_ADMIN_EMAIL` pode concluir autenticacao.
- [x] OTP e validado pelo Supabase Auth sem senha propria no CRM.
- [x] Sessao usa cookie assinado HttpOnly, SameSite=Lax e Secure em producao.
- [x] Segredo ausente ou curto falha fechado.
- [x] Paginas privadas redirecionam para login preservando retorno interno seguro.
- [x] APIs privadas retornam 401 JSON sem sessao.
- [x] Webhook Uazapi e callbacks externos necessarios continuam funcionais.
- [x] Logout invalida o cookie local.
- [x] Nenhum segredo ou e-mail administrativo e enviado ao bundle cliente.
- [x] As novas rotas da Story 023 usam obrigatoriamente o mesmo guard.
- [x] Testes cobrem assinatura, expiracao, allowlist, retorno e proxy.
- [x] Lint, typecheck, testes e build passam.

## Tasks / Subtasks

- [x] Criar testes RED de sessao e autorizacao.
- [x] Implementar assinatura/verificacao Edge-compatible.
- [x] Implementar solicitacao e verificacao de OTP server-side.
- [x] Implementar proxy e excecoes publicas minimas.
- [x] Criar pagina de login e logout.
- [x] Proteger as rotas da Story 023.
- [x] Atualizar ambiente e runbook.
- [x] Executar quality gates e smoke sem enviar mensagens comerciais.

## Fora de Escopo

- Multiplos usuarios, papeis ou equipes.
- Login social.
- Recuperacao de senha propria.
- SSO corporativo.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Testes direcionados de auth/proxy/UI: PASS.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` e `npm.cmd run build`: PASS.
- Smoke local: `/login` HTTP 200, `/pipeline` HTTP 307 para login e `/api/prospecting` HTTP 401.
- Smoke visual desktop de `/login`: PASS.
- Regressao do magic link: 6 testes direcionados e suite completa com 62 testes: PASS.
- Smoke em `localhost:3000`: `/login` HTTP 200 e solicitacao real do link HTTP 202.

### Completion Notes List

- Login passwordless por OTP do Supabase Auth, limitado a um e-mail server-side.
- Fluxo ajustado para o magic link nativo do Supabase: token removido da URL e
  validado no servidor antes da emissao do cookie administrativo.
- Cookie HMAC HttpOnly com sete dias de validade e falha fechada sem configuracao.
- Excecoes publicas limitadas a assets, auth e integracoes externas autenticadas pelo proprio provedor.
- Ativacao aguarda definir `CRM_ADMIN_EMAIL` e `CRM_AUTH_SECRET` no ambiente.

### File List

- `docs/plans/2026-08-04-login-administrativo-design.md`
- `docs/plans/2026-08-04-login-administrativo.md`
- `docs/stories/story-024-login-administrativo.md`
- `docs/RUNBOOK-prospeccao.md`
- `.env.example`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/link/route.ts`
- `src/app/api/auth/request/route.ts`
- `src/app/login/LoginForm.tsx`
- `src/app/login/login.css`
- `src/app/login/page.tsx`
- `src/app/auth/callback/page.tsx`
- `src/components/SupabaseAuthBridge.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Topbar.tsx`
- `src/lib/adminAuth.ts`
- `src/lib/supabaseAuth.ts`
- `src/proxy.ts`
- `tests/admin-auth-proxy.test.ts`
- `tests/admin-auth-routes.test.ts`
- `tests/admin-auth.test.ts`
- `tests/admin-login-ui.test.ts`

## Change Log

- 2026-08-04: Story criada apos aprovacao explicita de login administrativo para o CRM.
- 2026-08-04: Login alinhado ao magic link nativo do Supabase e ao callback seguro na porta 3000.
