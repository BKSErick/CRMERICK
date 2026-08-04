# Design - Login Administrativo do CRM Erick

## Decisao aprovada

Proteger o CRM inteiro com uma unica identidade administrativa. O acesso usa magic
link enviado pelo Supabase Auth ao e-mail definido em `CRM_ADMIN_EMAIL`.
Nenhuma senha e armazenada no repositorio, no navegador ou em tabelas proprias.

## Fluxo

1. Visitante sem sessao e redirecionado para `/login`.
2. O e-mail informado precisa coincidir exatamente com `CRM_ADMIN_EMAIL`.
3. O servidor garante que essa identidade existe no Supabase Auth e solicita o link.
4. Erick abre o magic link recebido por e-mail.
5. O cliente remove o token da URL e o servidor valida a identidade no Supabase.
6. O servidor cria cookie assinado, `HttpOnly`, `Secure` em producao,
   `SameSite=Lax` e com expiracao curta.
7. Middleware valida assinatura e expiracao antes de liberar paginas e APIs.
8. Logout apaga a sessao.

## Excecoes publicas

- `/login`, `/auth/callback` e `/api/auth/*`;
- assets do Next.js;
- webhook Uazapi, que preserva sua autenticacao por segredo;
- callbacks OAuth externos estritamente necessarios.

APIs protegidas retornam 401 JSON. Paginas protegidas redirecionam para login.
Sem `CRM_ADMIN_EMAIL` ou `CRM_AUTH_SECRET`, o sistema falha fechado.

## Seguranca

- Comparacao de e-mail normalizada e constante no servidor.
- Segredo de sessao com pelo menos 32 caracteres.
- Assinatura HMAC SHA-256 compatível com middleware Edge.
- Cookie nunca fica disponivel para JavaScript.
- URL de retorno limitada a caminhos internos.
- Respostas de solicitacao do link nao revelam se outro e-mail e permitido.
- Fragmentos com token sao removidos da URL antes da troca por sessao HttpOnly.
- Nenhum segredo e incluido em bundle cliente, log ou resposta.
