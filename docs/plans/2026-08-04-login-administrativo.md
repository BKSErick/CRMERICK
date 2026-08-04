# Plano de Implementacao - Login Administrativo

## Tarefa 1 - Sessao assinada

**Arquivos:** `tests/admin-auth.test.ts`, `src/lib/adminAuth.ts`

Criar RED para HMAC, expiracao, segredo fraco, e-mail permitido e retorno interno.
Implementar funcoes puras Edge-compatible. Verificar com teste direcionado.

## Tarefa 2 - Rotas do magic link

**Arquivos:** `src/app/api/auth/request/route.ts`,
`src/app/api/auth/link/route.ts`, `src/app/api/auth/logout/route.ts`

Validar allowlist server-side, criar somente o usuario administrativo ausente,
solicitar magic link pelo Supabase, validar o usuario e emitir/apagar cookie
HttpOnly. Nunca retornar segredo ou registrar token.

## Tarefa 3 - Proxy do Next 16

**Arquivos:** `src/proxy.ts`, `tests/admin-auth-proxy.test.ts`

Proteger paginas e APIs; manter publicos somente login, auth, assets e integracoes
externas com autenticacao propria. O callback de autenticacao permanece publico.
APIs devolvem 401; paginas redirecionam.

## Tarefa 4 - Interface

**Arquivos:** `src/app/login/page.tsx`, `src/app/login/login.css`,
`src/app/auth/callback/page.tsx`, `src/components/SupabaseAuthBridge.tsx`,
`src/components/Sidebar.tsx`

Criar solicitacao do link, ponte que limpa o fragmento sensivel, retorno interno e
logout. Validar teclado, mobile e estados de erro.

## Tarefa 5 - Integrar Stories 023 e 024

Criar rotas protegidas de prospeccao, concluir a central e executar lint, typecheck,
testes, build e smoke local sem disparo comercial.
