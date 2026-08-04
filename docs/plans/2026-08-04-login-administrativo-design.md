# Design - Login Administrativo do CRM Erick

## Decisao aprovada

Proteger o CRM inteiro com uma unica identidade administrativa. O acesso usa e-mail
e senha validados pelo Supabase Auth. A senha fica armazenada somente pelo Supabase,
nunca no repositorio, em variavel de ambiente ou em tabela propria do CRM.

## Fluxo

1. Visitante sem sessao e redirecionado para `/login`.
2. O e-mail informado precisa coincidir exatamente com `CRM_ADMIN_EMAIL`.
3. O servidor envia e-mail e senha diretamente ao Supabase Auth.
4. O Supabase valida a credencial e devolve a identidade autenticada ao servidor.
5. O servidor confere novamente a allowlist e cria cookie assinado, `HttpOnly`,
   `Secure` em producao, `SameSite=Lax` e com expiracao de sete dias.
6. Middleware valida assinatura e expiracao antes de liberar paginas e APIs.
7. Logout apaga a sessao local.

## Excecoes publicas

- `/login` e `/api/auth/*`;
- assets do Next.js;
- webhook Uazapi, que preserva sua autenticacao por segredo;
- callbacks OAuth externos estritamente necessarios.

APIs protegidas retornam 401 JSON. Paginas protegidas redirecionam para login.
Sem `CRM_ADMIN_EMAIL` ou `CRM_AUTH_SECRET`, o sistema falha fechado.

## Seguranca

- Comparacao de e-mail normalizada no servidor antes e depois do Supabase Auth.
- Segredo de sessao com pelo menos 32 caracteres.
- Assinatura HMAC SHA-256 compativel com middleware Edge.
- Cookie nunca fica disponivel para JavaScript.
- URL de retorno limitada a caminhos internos.
- Erro de credencial nao revela se o e-mail ou a senha estava incorreto.
- Senha nao e gravada em bundle cliente, log, cookie ou resposta.
