# Story 020 - Ingestao de WhatsApp via Uazapi

## Status

Ready for Review

## Story

Como Erick, quero que o CRM leia as mensagens individuais enviadas e recebidas no meu WhatsApp, para manter contatos, oportunidades e contexto comercial atualizados sem responder automaticamente.

## Contexto

- Prova de conceito com servidor gratuito temporario da Uazapi.
- O CRM ja usa Next.js, Supabase server-side, `messages`, `activities` e IA com fallback gratuito.
- Design aprovado em `docs/plans/2026-07-29-uazapi-crm-design.md`.
- A integracao e somente leitura do WhatsApp: nao envia nem responde mensagens.

## Acceptance Criteria

- [x] Existe webhook server-side autenticado por segredo independente do token da instancia.
- [x] Mensagens individuais enviadas e recebidas sao normalizadas e persistidas.
- [x] Grupos, status/canais e mensagens originadas pela API sao ignorados.
- [x] A mesma mensagem nao e persistida duas vezes.
- [x] Contato e deal sao ligados por telefone; ausentes sao criados como lead/prospect.
- [ ] A mensagem aparece na timeline do deal.
- [x] IA gera insight best-effort sem responder, alterar etapa ou impedir a ingestao em caso de falha.
- [x] Nenhum token real ou payload bruto e versionado.
- [x] Existe configurador CLI com `--dry-run`.
- [x] Testes direcionados, lint, typecheck e build passam.
- [ ] Uma mensagem real e validada durante a janela gratuita.

## Tasks / Subtasks

- [x] Criar teste RED do contrato do webhook.
- [x] Implementar normalizacao, filtros e autenticacao ate GREEN.
- [x] Criar migration aditiva/idempotente de `messages`.
- [x] Implementar persistencia e vinculacao contato/deal.
- [x] Integrar timeline e insight de IA best-effort.
- [x] Criar configurador CLI e contrato de ambiente.
- [x] Executar quality gates.
- [ ] Publicar, configurar webhook e executar smoke real. A migration ja foi aplicada.

## Dependencias

- Servidor/instancia Uazapi ativa durante a janela do teste.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no servidor.
- `OPENROUTER_API_KEY` ou `GROQ_API_KEY` apenas para o insight opcional.

## Riscos

- A Uazapi e uma API nao oficial; o usuario aceitou o risco para este teste.
- O servidor gratuito expira; a ingestao para quando a instancia sair do ar.
- Payloads podem variar; o normalizador deve aceitar o envelope documentado sem persistir dados extras.
- IA gratuita pode ficar indisponivel; persistencia da mensagem tem prioridade.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED: `node --test tests/uazapi-webhook.test.ts` falhou com `ERR_MODULE_NOT_FOUND` antes da implementacao.
- GREEN: `npm.cmd test` passou 7/7.
- `npm.cmd run lint` passou. Dois erros herdados em `pipeline/page.tsx` foram corrigidos por causa raiz antes do gate.
- `npm.cmd run typecheck` passou.
- `npm.cmd run build` passou e listou `/api/webhooks/uazapi` como rota dinamica.
- `npm.cmd run whatsapp:webhook:dry` passou com token e segredo redigidos.
- Secret scan nao encontrou `UAZAPI_INSTANCE_TOKEN` ou `UAZAPI_WEBHOOK_SECRET` preenchidos no repositorio.
- Migration `20260729_uazapi_messages.sql` aplicada no Supabase via Management API, HTTP 201.
- CodeRabbit nao executado porque este Windows nao possui distribuicao WSL instalada.

### Completion Notes List

- Webhook apenas de ingestao; nao existe chamada de envio para a Uazapi.
- Segredo exclusivo e aleatorio; apenas SHA-256 fica em `integration_settings` com RLS deny-by-default.
- Mensagens usam indice unico `(provider, provider_message_id)`.
- IA roda via `after()` e e best-effort, depois da persistencia principal.
- Publicacao/configuracao e smoke real permanecem como checkpoint operacional final.

### File List

- `docs/plans/2026-07-29-uazapi-crm-design.md`
- `docs/plans/2026-07-29-uazapi-crm.md`
- `docs/stories/story-020-uazapi-whatsapp-ingestao.md`
- `.env.example`
- `package.json`
- `tsconfig.json`
- `scripts/configure-uazapi-webhook.mjs`
- `scripts/migrations/20260729_uazapi_messages.sql`
- `scripts/supabase-schema.sql`
- `src/app/api/webhooks/uazapi/route.ts`
- `src/app/pipeline/page.tsx`
- `src/lib/uazapiWebhook.ts`
- `tests/uazapi-webhook.test.ts`

## Change Log

- 2026-07-29: Story criada apos aprovacao explicita do desenho da prova de conceito.
- 2026-07-29: Implementacao e migration concluidas; status Ready for Review aguardando publicacao e mensagem real.
