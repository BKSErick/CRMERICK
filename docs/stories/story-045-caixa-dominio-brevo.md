# Story 045 — Caixa @mydrion.com.br e rastreabilidade Brevo

**Status:** In Progress
**Data:** 2026-09-08
**Origem:** pedido direto do Erick para receber respostas em `contato@mydrion.com.br`
e concluir com seguranca o disparo automatizado iniciado no Brevo.

## Contexto

O Brevo ja envia como `contato@mydrion.com.br`, com o dominio autenticado, mas o
dominio nao possui MX e por isso respostas dos leads retornam com erro. Os nove
primeiros envios tambem nasceram como atividades orfas e foram religados manualmente.

O motor corrigido deve preservar o dedup local, usar o relacionamento real
`deals.contact_id`, deixar falhas de persistencia visiveis e permitir receber no
endereco do dominio sem trocar os nameservers ou interromper o site na Vercel.

## Acceptance Criteria

- [x] Os nove e-mails ja enviados permanecem ligados aos deals corretos, sem reenvio
      ou duplicacao de atividade.
- [x] A fila usa `deals.contact_id` como chave real do contato e nao presume que o ID
      do contato seja igual ao ID do deal.
- [x] Cada novo envio bem-sucedido registra `deal_id`, `contact_id`, destinatario,
      assunto, provedor e `message_id` na atividade do CRM.
- [x] Falha HTTP ao registrar a atividade nao e silenciosa e nao transforma um e-mail
      ja aceito pelo Brevo em candidato a reenvio.
- [x] O modo `--check` valida o destino de resposta e alerta quando o dominio nao tem
      MX, sem enviar e-mail.
- [x] Testes de regressao cobrem contato diferente do deal, payload da atividade e
      falha do Supabase sem fazer chamadas externas reais.
- [x] O runbook documenta ImprovMX Free para encaminhamento, Brevo para envio e a
      verificacao final de recebimento sem tratar o encaminhamento como uma caixa.
- [ ] Lint, typecheck, testes, build e `git diff --check` passam antes da conclusao.

## Fora do escopo

- Migrar o envio transacional do Brevo para ImprovMX.
- Reenviar os nove e-mails existentes.
- Trocar nameservers, hospedagem do site ou dominio.
- Automatizar resposta a leads recebidos.

## File List

- [x] `docs/stories/story-045-caixa-dominio-brevo.md`
- [x] `docs/RUNBOOK-prospeccao.md`
- [x] `scripts/email/build-queue-institucional.mjs`
- [x] `scripts/email/brevo_send.mjs`
- [x] `scripts/email/brevo-support.mjs`
- [x] `tests/brevo-email.test.ts`
- [x] `package.json`
- [x] `plan/self-critique-story-045.json`

## Evidencia de diagnostico

- Brevo: plano gratuito ativo, 9 envios no log local e remetente
  `contato@mydrion.com.br`; `--check` executado sem disparo.
- DNS autoritativo: `ns1.vercel-dns.com` e `ns2.vercel-dns.com`.
- O dominio esta autenticado para envio no Brevo e possui DMARC; `mydrion.com.br`
  nao possui MX em 2026-09-08.
- Supabase: 9/9 atividades `email_sent` de hoje possuem `deal_id` e `contact_id`, sem
  orfas; os nove relacionamentos atuais coincidem, mas o schema define
  `deals.contact_id` como a chave real.
- Fila reconstruida sem disparo: 40 itens, nenhum sem `dealId` ou `contactId`, com
  32 destinatarios ainda pendentes depois do dedup do log local.
- Validacao focada: 10/10 testes Brevo, `node --check`, lint e typecheck passaram.
- Gate global ainda nao fecha: 1 teste preexistente espera `Ficha de Escopo` onde o
  conteudo atual usa `Pedido Pronto`; o build para no drift preexistente do DNA de
  `alex-hormozi`. Nenhum desses dois arquivos foi alterado nesta story.

## Pendencias de rollout

- [x] Criar a conta gratuita no ImprovMX, adicionar `mydrion.com.br` e cadastrar o alias
  `contato` apontando para a conta Gmail operacional.
- [x] Publicar o preset ImprovMX no DNS da Vercel, preservar a autenticacao de envio do
  Brevo e validar recebimento externo em `contato@mydrion.com.br`.
- [x] Conectar a caixa operacional ao Brevo Conversations e confirmar que a mensagem
  encaminhada aparece tanto no Gmail quanto na caixa de equipe do Brevo.
- Nenhum commit, push ou deploy foi solicitado.

## Evidencia de rollout externo

- 2026-09-08: Google Public DNS respondeu com `mx1.improvmx.com` (prioridade 10)
  e `mx2.improvmx.com` (prioridade 20).
- 2026-09-08: SPF `include:spf.improvmx.com` e DMARC do Brevo permaneceram publicados.
- 2026-09-08: teste externo para `contato@mydrion.com.br` chegou ao Gmail encaminhado
  e apareceu na caixa de equipe conectada do Brevo Conversations.
