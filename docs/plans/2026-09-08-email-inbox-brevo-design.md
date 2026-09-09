# Design — Caixa de e-mails Brevo no CRM Eric

**Data:** 2026-09-08
**Status:** Aprovado pelo fluxo real de configuracao e teste

## Objetivo

Adicionar ao CRM Eric uma area `E-mails` que recebe as conversas da caixa de equipe
do Brevo, relaciona cada participante ao contato/deal existente e permite consultar
a thread completa sem duplicar o pipeline.

## Decisoes aprovadas

- O CRM e a fonte de verdade operacional; Brevo transporta e sincroniza mensagens.
- ImprovMX apenas encaminha `contato@mydrion.com.br` ao Gmail operacional.
- A caixa de equipe do Brevo recebe todos os e-mails e publica eventos por webhook.
- `messages` continua como fonte canonica do conteudo; `activities` permanece auditoria.
- Um novo registro `email_threads` materializa assunto, participante, vinculo e estado
  de leitura para paginação eficiente.
- A lista usa paginação server-side de 10 threads.
- Correspondencia com lead e somente por e-mail exato normalizado. Mensagem sem match
  aparece como `Sem lead vinculado`; nao cria contato/deal automaticamente.
- Nesta story a caixa e de leitura. Nenhuma resposta automatica e nenhum novo disparo
  sao autorizados.

## Experiencia

`E-mails` entra na navegacao principal. A pagina possui busca e filtros, lista de
threads a esquerda e conversa a direita. Cada item mostra participante, empresa,
assunto, trecho, horario e nao lidas. Ao selecionar, a URL preserva `thread`, a thread
e marcada como lida e o contexto do deal aparece no cabecalho com link para o card.

Em telas estreitas, lista e conversa deixam de dividir a largura: a conversa ocupa
o painel e oferece retorno para a lista.

## Persistencia

`email_threads`:

- identidade interna e `provider_thread_id` unico;
- `deal_id`/`contact_id` opcionais com `ON DELETE SET NULL`;
- participante, assunto, preview, estado, nao lidas e datas.

Extensoes aditivas em `messages`:

- `email_thread_id`, `subject`, remetente/destinatarios e reply-to;
- HTML seguro fornecido pelo Brevo, `source_message_id` e anexos;
- preservacao da unicidade parcial `(provider, provider_message_id)`.

O HTML bruto inseguro do webhook nao e persistido nem renderizado.

## Webhook

`POST /api/webhooks/brevo/conversations` aceita `conversationStarted` e
`conversationFragment`, autentica por segredo server-side, normaliza mensagens de
fonte e-mail e deduplica antes de inserir. Reentrega nao aumenta `unread_count`.

Mensagens recebidas publicam best-effort `message.received` no motor comercial e
registram atividade vinculada quando existe deal. Falhas parciais ficam observaveis,
mas o endpoint continua idempotente para retry do provedor.

## Seguranca

- `BREVO_CONVERSATIONS_WEBHOOK_SECRET` fica apenas no servidor.
- Service role Supabase nunca chega ao navegador.
- Payload possui limite de tamanho e validacao estrutural.
- Comparacao de segredo usa tempo constante.
- Anexos sao exibidos apenas como metadados/link do provedor; nenhum download automatico.
- Sem renderizar `rawUnsafeHtml`.

## Fora do escopo

- Editor visual de automacoes, que sera uma story propria sobre o motor da Story 027.
- Resposta manual pelo CRM e envio automatico.
- Importar historico anterior ao primeiro webhook.
- Criar lead automaticamente a partir de spam ou remetente desconhecido.

## Validacao

Testes RED/GREEN do normalizador, segredo, deduplicacao e paginacao; lint, typecheck,
suite e build. Migration remota, webhook real e deploy sao evidencias separadas da
implementacao local.
