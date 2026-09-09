# Ativar a inbox gratuita Gmail -> CRM

## 1. Criar o script

1. Entre em `https://script.google.com` com a conta Gmail que recebe os e-mails da Mydrion.
2. Clique em **Novo projeto** e use o nome `Mydrion - Gmail para CRM`.
3. Apague o exemplo de `Code.gs`.
4. Cole todo o conteudo de `integrations/google-apps-script/gmail-to-crm.gs` e salve.

## 2. Configurar propriedades

Em **Configuracoes do projeto > Propriedades do script**, adicione:

| Propriedade | Valor |
| --- | --- |
| `CRM_WEBHOOK_URL` | `https://crm.mydrion.com.br/api/webhooks/gmail/apps-script` |
| `CRM_WEBHOOK_SECRET` | valor local de `BREVO_CONVERSATIONS_WEBHOOK_SECRET` no `.env` do CRM |
| `CRM_MAILBOX_ADDRESSES` | `contato@mydrion.com.br` |

Nao cole o segredo em conversa, print ou no codigo do Apps Script.

## 3. Autorizar e instalar

1. No seletor de funcao, escolha `instalarSincronizacao`.
2. Clique em **Executar**.
3. Autorize acesso ao Gmail e chamadas externas.
4. Confirme em **Acionadores** que `sincronizarGmailComCrm` esta agendado a cada 5 minutos.

A primeira execucao busca ate 100 threads dos ultimos 30 dias, inclusive Spam. Depois,
o script sincroniza apenas a janela recente com sobreposicao para evitar perdas.

## 4. Validar

Envie um novo e-mail para `contato@mydrion.com.br`, aguarde ate 5 minutos e abra
`https://crm.mydrion.com.br/emails`. Se necessario, consulte **Execucoes** no Apps Script;
o log mostra somente contagens e status, nunca o corpo das mensagens.
