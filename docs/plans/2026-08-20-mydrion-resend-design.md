# Design - Resend transacional da Mydrion no CRM ERICK

**Data:** 2026-08-20  
**Status:** Aprovado  
**Decisao do usuario:** opcao 1 - modulo transacional separado com teste manual

## Objetivo

Adicionar ao CRM ERICK uma integracao server-side com a API do Resend para os
emails transacionais da Mydrion, com um primeiro fluxo manual de teste para o
endereco proprietario da conta. A integracao deve ser reutilizavel por futuras
rotas autenticadas, mas nao deve expor agora um endpoint publico nem enviar
mensagens durante os quality gates.

## Decisoes aprovadas

- Manter a integracao e a credencial no repositorio CRM ERICK.
- Identificar o servico e os comandos como infraestrutura da Mydrion.
- Ler a chave exclusivamente de `process.env.RESEND_API_KEY`.
- Manter o motor Brevo, a fila de prospeccao e seus logs inalterados.
- Usar `Mydrion <onboarding@resend.dev>` apenas para o primeiro teste controlado.
- Exigir destinatario explicito no comando manual; nao embutir email pessoal no
  codigo versionado.
- Nao realizar envio real automaticamente em testes, build ou nesta entrega.
- Depois da verificacao DNS, aceitar remetente configuravel da Mydrion por
  variavel de ambiente sem alterar o codigo.

## Arquitetura

### Servico

Um modulo em `src/lib/mydrionEmail.mjs` encapsula o cliente Resend e oferece uma
funcao unica de envio transacional. O contrato valida remetente, destinatarios,
assunto e corpo HTML, trata o retorno `{ data, error }` do SDK e nunca inclui a
API key em mensagens de erro ou logs.

O construtor do servico aceita injecao de cliente para permitir testes sem rede.
A instancia real usa `process.env.RESEND_API_KEY` apenas no processo server-side
ou no script local.

### Comando manual

`scripts/email/send-mydrion-test.mjs` carrega `.env` com o suporte nativo do
Node, exige `--to=<email>` e chama o servico com o conteudo de primeiro teste.
Sem `--send`, o comando apenas valida a configuracao e informa que nenhum email
foi enviado. O envio real exige simultaneamente destinatario explicito e a flag
`--send`.

### Configuracao

- `RESEND_API_KEY`: segredo obrigatorio e server-only.
- `MYDRION_EMAIL_FROM`: remetente opcional; default temporario
  `Mydrion <onboarding@resend.dev>`.

`.env.example` documenta apenas placeholders. O `.env` real continua ignorado
e nao rastreado pelo Git.

## Seguranca e reputacao

- A chave nunca aparece em codigo, fixtures, snapshots, saidas ou mensagens de
  erro.
- A API nao sera exposta ao navegador.
- Cold email e prospeccao permanecem no Brevo e fora deste servico.
- O dominio da Mydrion sera verificado depois no Resend, preferencialmente por
  subdominio de envio, antes de usar destinatarios externos.
- A chave compartilhada na conversa deve ser rotacionada antes da producao.

## Testes e verificacao

- Testes unitarios com cliente Resend falso, cobrindo sucesso, erro do provider,
  chave ausente, dados invalidos e nao vazamento da chave.
- Teste do comando em modo de validacao, sem rede e sem envio.
- `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
- Nenhum comando de verificacao envia email real.

## Fora de escopo

- Endpoint publico ou botao de envio no CRM.
- Email marketing, cold email ou migracao da fila Brevo.
- Recebimento de email ou caixa postal semelhante ao Gmail.
- Configuracao DNS do dominio e cadastro do segredo na Vercel nesta story.
- Envio real sem uma nova autorizacao explicita do usuario.

## Rollback

Remover o script, o modulo, o teste, a dependencia `resend`, os scripts npm e os
placeholders adicionados ao `.env.example`. O motor Brevo nao exige rollback por
nao ser modificado.
