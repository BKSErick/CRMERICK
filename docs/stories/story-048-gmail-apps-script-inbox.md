# Story 048 - Captura gratuita de e-mails pelo Gmail

## Status

Deployed - Google Apps Script authorization pending

## Story

Como operador comercial, quero sincronizar gratuitamente os e-mails recebidos no Gmail
com a inbox do CRM, para nao depender do modulo pago de webhooks do Brevo Conversations.

## Dependencias

- Story 045: ImprovMX encaminhando `contato@mydrion.com.br` para Gmail.
- Story 046: inbox, tabelas e leitura de threads ja publicadas.
- Design aprovado em `docs/plans/2026-09-09-gmail-apps-script-inbox-design.md`.

## Acceptance Criteria

1. A captura nao exige plano pago do Brevo, ImprovMX SMTP ou Google Workspace.
2. Um Apps Script somente leitura consulta mensagens do alias e sincroniza a cada 5 minutos.
3. A busca inclui mensagens em Spam e possui primeira carga limitada aos ultimos 30 dias.
4. O webhook do CRM exige segredo, valida estritamente o payload e limita o corpo a 1 MB.
5. Texto e metadados seguros sao persistidos; HTML e binarios de anexos sao descartados.
6. Gmail usa provider proprio e nao colide com ids de Brevo ou WhatsApp.
7. Reentregas sao idempotentes e remetentes desconhecidos nao criam leads.
8. Nenhum caminho envia, responde, apaga, move ou marca mensagens no Gmail.
9. Testes focados, regressao da inbox, lint, typecheck, audit e build sao executados.
10. Deploy e ativacao manual do Google sao reportados separadamente.

## Tasks / Subtasks

- [x] Criar testes RED do payload e da rota Gmail.
- [x] Implementar normalizador estrito e repositorio por provider.
- [x] Implementar webhook Gmail autenticado e publico no proxy.
- [x] Criar Apps Script somente leitura e guia de ativacao.
- [x] Executar gates e revisar seguranca/idempotencia.
- [x] Publicar staging isolado e validar producao.

## Fora de Escopo

- Envio ou resposta automatica.
- Anexos binarios ou HTML bruto.
- Google Cloud Pub/Sub, Gmail API OAuth ou servidor IMAP.
- Compra de plano do Brevo ou ImprovMX.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED inicial: 2 suites falharam pela ausencia do normalizador, rota e Apps Script.
- `npm.cmd run test:email-inbox`: 43/43 testes passando.
- `npm.cmd run test:email-automations`: 21/21 testes passando.
- `npm.cmd run lint`: passou sem erros; duas advertencias preexistentes de navegacao.
- `npm.cmd run typecheck`: passou.
- `npm.cmd audit --omit=dev --json`: 0 vulnerabilidades de producao.
- `npx.cmd next build --webpack`: compilou 82 rotas no checkout e no staging isolado.
- `npm.cmd test`: 385/386; falha preexistente de copy em `tests/sales-automation.test.ts`
  espera `Ficha de Escopo`, enquanto o playbook atual usa `Pedido Pronto`.
- `npm.cmd run build`: no checkout para antes do Next por drift preexistente no DNA
  `alex-hormozi`; no staging o DNA dos sete especialistas passou.
- CodeRabbit nao executado porque o Windows nao possui uma distribuicao WSL instalada.
- Deploy `dpl_2UEnavyJHtQfAVjKSBqP144tfhJH` ficou `READY` com alias
  `crm.mydrion.com.br`.
- Smoke de producao: chamada sem segredo retornou 401; health check autenticado e
  sem persistencia retornou 202 com `ignored: true`.
- A republicacao posterior apenas do script/docs recebeu HTTP 429 no limite gratuito
  de uploads da Vercel; o endpoint ja publicado nao mudou e o Apps Script executa no Google.

### Completion Notes List

- Brevo permanece somente como provedor de envio; a captura nao usa seu webhook pago.
- Apps Script consulta Gmail a cada cinco minutos, inclusive Spam, e limita a primeira carga.
- O endpoint valida segredo, tamanho e estrutura antes de tocar no repositorio.
- Mensagens Gmail usam `gmail_apps_script`, preservando a idempotencia por provedor.
- A integracao transfere apenas texto e metadados; HTML e anexos binarios ficam fora.
- Cada lote e medido em bytes e fica abaixo de 900 kB para respeitar a trava de 1 MB.
- A aplicacao foi publicada e validada separadamente da autorizacao da conta Google.
- Resta colar o script, configurar as propriedades e autorizar o acionador no Google.

### File List

- `docs/plans/2026-09-09-gmail-apps-script-inbox-design.md`
- `docs/plans/2026-09-09-gmail-apps-script-inbox.md`
- `docs/stories/story-048-gmail-apps-script-inbox.md`
- `.env.example`
- `package.json`
- `docs/guides/gmail-apps-script-inbox.md`
- `integrations/google-apps-script/gmail-to-crm.gs`
- `src/app/api/webhooks/gmail/apps-script/route.ts`
- `src/lib/adminAuth.ts`
- `src/lib/brevoConversationRepository.ts`
- `src/lib/brevoConversationService.ts`
- `src/lib/gmailAppsScript.ts`
- `tests/gmail-apps-script-source.test.ts`
- `tests/gmail-apps-script-webhook.test.ts`

## Change Log

- 2026-09-09: Story criada depois da confirmacao de que webhooks do Brevo Conversations sao pagos.
- 2026-09-09: Sincronizacao gratuita Gmail, endpoint autenticado e testes implementados.
- 2026-09-09: Staging isolado publicado em producao; autorizacao Google permanece manual.
- 2026-09-09: Lotes do Apps Script passaram a respeitar tambem o tamanho real em bytes.
