# Design - Inbox gratuita Gmail -> CRM

## Decisao

Substituir o webhook pago do Brevo Conversations por um sincronizador gratuito em
Google Apps Script, executado na propria conta Gmail que recebe os encaminhamentos do
ImprovMX.

## Fluxo

`contato@mydrion.com.br` -> ImprovMX -> Gmail -> Apps Script (5 min) -> webhook CRM ->
`email_threads` + `messages`.

O Brevo continua isolado como provedor de envio. A captura de respostas nao depende de
Sales Essentials, Sales Advanced, SMTP do ImprovMX ou Google Workspace.

## Limites de seguranca

- O Apps Script apenas le Gmail e envia texto puro/metadados; nao envia, apaga ou marca e-mail.
- O webhook aceita somente `POST`, exige Bearer secret e limita o corpo a 1 MB.
- O servidor valida fonte, ids, enderecos, direcao, datas, quantidade e tamanho das mensagens.
- HTML bruto e conteudo de anexos nao entram no CRM.
- Reentregas sao idempotentes por `provider + provider_message_id`.
- Remetente desconhecido nao cria contato ou oportunidade.
- O segredo fica em Script Properties e em variavel server-side; nunca no codigo.

## Sincronizacao

- Trigger instalavel a cada 5 minutos.
- Primeira execucao: ate 100 threads dos ultimos 30 dias envolvendo o alias configurado.
- Execucoes seguintes: janela desde o ultimo sucesso com sobreposicao de 10 minutos.
- O cursor so avanca quando todas as threads retornam HTTP 2xx.
- Busca inclui Spam (`in:anywhere`), importante porque respostas encaminhadas podem cair la.

## Sem migration

O schema da Story 046 ja separa provider e provider ids, portanto o novo adaptador usa
`gmail_apps_script` sem alterar tabelas ou indices.

## Ativacao manual restante

O operador cria um projeto gratuito em script.google.com, cola o arquivo fornecido,
preenche tres Script Properties, executa `instalarSincronizacao` e aceita as permissoes do
Google. Essa autorizacao nao pode ser feita pelo servidor do CRM.
