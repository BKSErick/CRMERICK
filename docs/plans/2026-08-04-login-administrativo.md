# Plano de Implementacao - Login Administrativo

## Tarefa 1 - Sessao assinada

**Arquivos:** `tests/admin-auth.test.ts`, `src/lib/adminAuth.ts`

Criar RED para HMAC, expiracao, segredo fraco, e-mail permitido e retorno interno.
Implementar funcoes puras Edge-compatible. Verificar com teste direcionado.

## Tarefa 2 - Login por senha

**Arquivos:** `src/app/api/auth/login/route.ts`,
`src/app/api/auth/logout/route.ts`, `tests/admin-auth-routes.test.ts`

Validar allowlist server-side, autenticar com `signInWithPassword` no Supabase e
emitir/apagar cookie HttpOnly. Nunca retornar, registrar ou persistir a senha no CRM.

## Tarefa 3 - Proxy do Next 16

**Arquivos:** `src/proxy.ts`, `tests/admin-auth-proxy.test.ts`

Proteger paginas e APIs; manter publicos somente login, auth, assets e integracoes
externas com autenticacao propria. APIs devolvem 401; paginas redirecionam.

## Tarefa 4 - Interface

**Arquivos:** `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx`,
`src/app/login/login.css`, `src/components/Sidebar.tsx`

Criar formulario de e-mail e senha, retorno interno, feedback generico e logout.
Validar teclado, mobile e estados de erro.

## Tarefa 5 - Integrar Stories 023 e 024

Criar rotas protegidas de prospeccao, concluir a central e executar lint, typecheck,
testes, build e smoke local sem disparo comercial.
