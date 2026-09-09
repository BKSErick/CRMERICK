# Story 046 — Caixa de e-mails Brevo no CRM

## Status

Deployed - captura gratuita substitui webhook pago

## Story

Como operador comercial, quero ver no CRM as conversas recebidas em
`contato@mydrion.com.br`, para acompanhar cada lead em uma lista paginada e abrir a
thread completa junto do contexto da oportunidade.

## Dependencias

- Story 045 com ImprovMX, Gmail e caixa de equipe Brevo validados em fluxo real.
- Story 027 preservada como motor central de eventos e acoes seguras.

## Acceptance Criteria

- [x] Existe item `E-mails` na navegacao e rota autenticada `/emails`.
- [x] A lista apresenta 10 threads por pagina, busca, nao lidas e estado vazio/erro.
- [x] Selecionar uma thread abre a conversa e preserva a selecao na URL.
- [x] Contato e deal sao relacionados por e-mail exato sem duplicar cadastros.
- [x] Remetentes desconhecidos aparecem sem vinculo e nao criam deal automaticamente.
- [x] Webhook Brevo Conversations exige segredo e aceita eventos de inicio/fragmento.
- [x] Reentrega do mesmo `provider_message_id` e idempotente.
- [x] Mensagens ficam em `messages`; metadados de agrupamento ficam em `email_threads`.
- [x] HTML bruto inseguro nao e salvo/renderizado e anexos nao sao baixados automaticamente.
- [x] Migration e schema local sao aditivos e usam `ON DELETE SET NULL` nos vinculos CRM.
- [x] Nenhum e-mail e enviado automaticamente ou durante os testes.
- [x] Lint, typecheck, testes e build passam antes da conclusao local.

## Tasks / Subtasks

- [x] Escrever testes RED do contrato Brevo e da paginacao.
- [x] Implementar normalizador puro e autenticacao do webhook.
- [x] Criar migration/schema de threads e metadados de e-mail.
- [x] Implementar persistencia idempotente e associacao exata contato/deal.
- [x] Criar APIs server-side de lista, detalhe e leitura.
- [x] Criar pagina `/emails`, navegacao e layout responsivo.
- [x] Executar gates, atualizar checklist e File List.

## Fora de Escopo

- Builder visual de automacoes.
- Envio/resposta manual pelo CRM.
- Envio automatico ou IA respondendo leads.
- Migration remota, configuracao real do webhook e deploy sem autorizacao especifica.

## Integracao Operacional

- O cadastro do webhook Brevo Conversations foi descartado porque exige modulo pago.
- A Story 048 substitui essa captura pelo fluxo gratuito Gmail + Google Apps Script.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- `npm.cmd run test:email-inbox`: 35/35 testes passando.
- `npm.cmd run lint`: passou sem erros; duas advertencias preexistentes de navegacao.
- `npm.cmd run typecheck`: passou.
- `npx.cmd next build --webpack`: Next 16.3.4 compilou 81 rotas, incluindo `/emails`, `/api/emails`,
  `/api/emails/read` e `/api/webhooks/brevo/conversations`.
- Suite completa: 385/386; bloqueio preexistente em
  `tests/sales-automation.test.ts`, que ainda espera `Ficha de Escopo` enquanto o
  playbook atual usa `Pedido Pronto`.
- `npm.cmd run build`: para antes do Next por drift preexistente no DNA
  `alex-hormozi`; a compilacao direta do Next passa.
- Migration remota verificada com RLS, grants e objetos da inbox preservados.
- Vercel secret `BREVO_CONVERSATIONS_WEBHOOK_SECRET` configurado como sensivel.
- Deploy de producao atual `dpl_6qiedrH5LLgyr3QV6pjQcZTPdbQU` ficou `READY`.
- Smoke publico: `/emails` redireciona para login e `/api/emails` retorna 401 sem sessao.

### Completion Notes List

- Implementada inbox server-side com dez threads por pagina, busca e filtro de nao lidos.
- Mensagens recebidas sao deduplicadas por provedor e vinculadas apenas por e-mail exato.
- Remetente desconhecido permanece visivel e nao cria contato ou deal implicitamente.
- A interface renderiza texto, nunca HTML recebido, e libera somente anexos HTTPS.
- A tela e somente leitura; nenhum caminho de envio foi criado nesta story.
- Migration remota, secret e deploy foram concluidos e verificados separadamente.
- O webhook Brevo permanece disponivel, mas nao e necessario para o fluxo gratuito da Story 048.

### File List

- `docs/plans/2026-09-08-email-inbox-brevo-design.md`
- `docs/plans/2026-09-08-email-inbox-brevo.md`
- `docs/stories/story-046-email-inbox-brevo.md`
- `.env.example`
- `package.json`
- `scripts/migrations/20260908_email_inbox_brevo.sql`
- `scripts/migrations/20260908_email_inbox_brevo.rollback.sql`
- `scripts/configure-brevo-webhook-secret.mjs`
- `scripts/smoke-email-inbox-live.mjs`
- `scripts/snapshot-db-schema.mjs`
- `scripts/verify-20260908-email-inbox.mjs`
- `scripts/supabase-schema.sql`
- `src/app/api/emails/read/route.ts`
- `src/app/api/emails/route.ts`
- `src/app/api/webhooks/brevo/conversations/route.ts`
- `src/app/emails/page.tsx`
- `src/app/globals.css`
- `src/components/Sidebar.tsx`
- `src/lib/adminAuth.ts`
- `src/lib/brevoConversationRepository.ts`
- `src/lib/brevoConversationService.ts`
- `src/lib/brevoConversations.ts`
- `src/lib/emailInbox.ts`
- `src/lib/emailInboxRepository.ts`
- `src/lib/navigation.ts`
- `tests/brevo-conversation-service.test.ts`
- `tests/brevo-conversations-route.test.ts`
- `tests/brevo-conversations-webhook.test.ts`
- `tests/email-inbox-routes.test.ts`
- `tests/email-inbox-schema.test.ts`
- `tests/email-inbox-ui.test.ts`
- `tests/email-inbox.test.ts`
- `tests/sql-transaction.test.ts`

## Change Log

- 2026-09-08: Story criada depois da validacao real ImprovMX -> Gmail -> Brevo.
- 2026-09-08: Inbox, webhook e persistencia implementados localmente com gates focados verdes.
- 2026-09-09: Migration, segredo e deploy aplicados e verificados em producao.
- 2026-09-09: Cadastro do webhook no Brevo Conversations documentado como unica pendencia manual.
- 2026-09-09: Pendencia paga cancelada e substituida pela captura Gmail da Story 048.
