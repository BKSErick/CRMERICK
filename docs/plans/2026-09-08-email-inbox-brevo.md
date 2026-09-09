# Plano de implementacao — Caixa de e-mails Brevo

**Design:** `docs/plans/2026-09-08-email-inbox-brevo-design.md`
**Story:** `docs/stories/story-046-email-inbox-brevo.md`

### Tarefa 1: Fixar contrato em testes RED

**Arquivos:** `tests/brevo-conversations-webhook.test.ts`, `tests/email-inbox.test.ts`, `package.json`

**Objetivo:** Cobrir segredo, eventos suportados, normalizacao segura, deduplicacao e
paginacao de 10 antes de criar o codigo de producao.

**Codigo:** Criar fixtures de `conversationStarted` e `conversationFragment` com
mensagens de e-mail recebidas/enviadas, anexos e `rawUnsafeHtml`; importar os modulos
ainda inexistentes para confirmar RED por `ERR_MODULE_NOT_FOUND`.

**Verificacao:**

```powershell
node --test tests/brevo-conversations-webhook.test.ts tests/email-inbox.test.ts
```

### Tarefa 2: Implementar contrato puro

**Arquivos:** `src/lib/brevoConversations.ts`, `src/lib/emailInbox.ts`

**Objetivo:** Normalizar o payload sem rede, validar segredo em tempo constante e
produzir modelos de thread/mensagem sem copiar HTML bruto.

**Codigo:** Exportar `isValidBrevoWebhookSecret`, `normalizeBrevoConversationEvent`,
`normalizeEmailAddress`, `paginateEmailThreads` e tipos compartilhados. Eventos que
nao forem de e-mail retornam lista vazia; payload invalido falha com erro explicito.

**Verificacao:** Reexecutar os testes focados ate GREEN.

### Tarefa 3: Adicionar schema de inbox

**Arquivos:** `scripts/migrations/20260908_email_inbox_brevo.sql`, `scripts/supabase-schema.sql`, `tests/email-inbox-schema.test.ts`

**Objetivo:** Criar `email_threads` e colunas aditivas de `messages` com indices, FKs
seguras e RLS deny-by-default.

**Codigo:** Usar `provider_thread_id` unico; FKs CRM `ON DELETE SET NULL`;
`email_thread_id` em mensagens; JSONB para destinatarios/anexos; indices por
`last_message_at` e `email_thread_id, occurred_at`.

**Verificacao:** Teste estatico confirma paridade migration/schema, indices e RLS.

### Tarefa 4: Persistir o webhook de forma idempotente

**Arquivos:** `src/app/api/webhooks/brevo/conversations/route.ts`, `src/lib/brevoConversationService.ts`, `tests/brevo-conversations-route.test.ts`

**Objetivo:** Autenticar, associar contato/deal por e-mail exato, inserir apenas
mensagens novas e atualizar thread/unread sem duplicacao.

**Codigo:** Consultar previamente `(provider, provider_message_id)` por causa do
indice parcial existente; nunca usar upsert nesse indice. Registrar `email_received`
e publicar `message.received` somente para insercao nova vinculada.

**Verificacao:** Testes com repositorio fake cobrem retry, desconhecido e falha.

### Tarefa 5: Criar APIs da caixa

**Arquivos:** `src/app/api/emails/route.ts`, `src/app/api/emails/read/route.ts`, `tests/email-inbox-routes.test.ts`

**Objetivo:** Servir lista paginada e thread selecionada exclusivamente no servidor.

**Codigo:** `GET /api/emails?page=1&q=&thread=` retorna 10 itens, total/paginas e
mensagens apenas da thread selecionada. `POST /api/emails/read` zera nao lidas.

**Verificacao:** Testes validam limites, query normalizada e respostas 400/500.

### Tarefa 6: Implementar interface E-mails

**Arquivos:** `src/lib/navigation.ts`, `src/components/Sidebar.tsx`, `src/app/emails/page.tsx`, `src/app/globals.css`, `tests/email-inbox-ui.test.ts`

**Objetivo:** Entregar a lista 10 por pagina e painel de conversa com contexto do lead.

**Codigo:** Adicionar icone de envelope, estados loading/empty/error, busca, badges,
paginacao e selecao via `thread` na URL. Renderizar texto seguro; anexos apenas como
links com `rel="noreferrer"`.

**Verificacao:** Teste estrutural da UI, typecheck e smoke visual local.

### Tarefa 7: Fechar story e gates

**Arquivos:** `docs/stories/story-046-email-inbox-brevo.md`, `.env.example`

**Objetivo:** Documentar segredo sem valor real, evidencias e limites de rollout.

**Verificacao:**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git -c safe.directory='D:/001Gravity/CRM ERICK' diff --check
```

Nenhum comando aplica migration remota, configura webhook, envia e-mail, publica ou
faz commit sem autorizacao especifica.
