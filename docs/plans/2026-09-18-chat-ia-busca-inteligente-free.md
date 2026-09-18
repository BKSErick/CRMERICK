# Plano de implementação — Chat IA com busca inteligente e modelos gratuitos

> Story: `docs/stories/story-055-chat-ia-busca-inteligente-free.md`

## Objetivo

Trocar o carregamento amplo do CRM por consultas determinísticas, pequenas e rastreáveis;
permitir seleção independente de especialista e modelo; e garantir que nenhuma chamada
OpenRouter paga ou de gratuidade não comprovada alcance a rede.

## Task 1 — Roteador de intenção fechado

**Arquivos:**

- Criar `tests/ai-query-router.test.ts`.
- Criar `src/lib/aiQueryRouter.ts`.

1. Escrever testes para as quatro intenções, `unknown`, limites e rejeição de chaves
   operacionais (`sql`, `tool`, `endpoint`, `mutation`).
2. Executar o teste e confirmar RED por módulo ausente.
3. Implementar normalização determinística sem uma segunda chamada de LLM.
4. Executar teste focado e refatorar mantendo GREEN.

## Task 2 — Elegibilidade e catálogo free-only

**Arquivos:**

- Modificar `tests/ai-model-catalog.test.ts`.
- Modificar `tests/ai-providers.test.ts`.
- Modificar `src/lib/aiModelCatalog.mjs` e `src/lib/aiModelCatalog.d.mts`.
- Modificar `src/lib/aiProviders.mjs` e `src/lib/aiProviders.d.mts`.

1. Criar RED provando que override pago é eliminado e modelo fixo pago falha antes do
   `fetch` de chat.
2. Expor metadados de todos os candidatos OpenRouter gratuitos, com contexto e preço.
3. Validar preferência `auto`/`fixed`; fixo usa apenas o modelo comprovado e não faz
   fallback silencioso.
4. Capturar usage e tentativas sanitizadas no retorno detalhado.
5. Executar testes de catálogo/providers.

## Task 3 — Broker de recuperação inteligente

**Arquivos:**

- Criar `tests/ai-retrieval-broker.test.ts`.
- Criar `src/lib/aiRetrievalBroker.ts`.
- Criar/alterar `src/lib/crmDailyPriorities.ts`.
- Modificar `src/app/api/comando/route.ts` e `src/app/api/ai-search/route.ts`.

1. Criar fakes do Supabase e testes RED para paginação/limites, última direção de e-mail,
   timeline WhatsApp e envelope compacto.
2. Extrair cálculo compartilhável de prioridades sem mudar o contrato de `/api/comando`.
3. Implementar consultas allowlisted, `select` mínimo, teto 50 e limitações explícitas.
4. Fazer `/api/ai-search` consumir a mesma busca tipada.
5. Rodar os testes focados e a regressão de Comando/follow-up.

## Task 4 — Prompt compacto e histórico limitado

**Arquivos:**

- Modificar `tests/ai-conversations.test.ts` e `tests/ai-context-broker.test.ts`.
- Modificar `src/lib/aiConversation.ts` e `src/lib/aiContextBroker.ts`.
- Criar `src/lib/aiMessageHistory.ts` se necessário.

1. Criar RED provando que pergunta operacional não recebe playbook nem contexto amplo.
2. Adicionar plano/evidências ao prompt e condicionar o playbook a intenção comercial.
3. Limitar por quantidade e caracteres o histórico enviado ao modelo.
4. Preservar proteção contra prompt injection e citações.

## Task 5 — Schema aditivo e persistência

**Arquivos:**

- Criar `scripts/migrations/20260918_ai_chat_smart_retrieval_free.sql`.
- Criar `scripts/migrations/20260918_ai_chat_smart_retrieval_free.rollback.sql`.
- Modificar `scripts/supabase-schema.sql` e `src/lib/emailInboxRepository.ts`.
- Criar/modificar testes de schema/inbox.

1. Criar teste estático RED para colunas, checks, RLS e índices.
2. Adicionar preferência, usage, tentativas e plano; materializar última direção do e-mail.
3. Backfill por `occurred_at desc nulls last, id desc` e índices parciais.
4. Atualizar `refreshThread()` e snapshot consolidado.
5. Validar SQL/rollback localmente sem aplicar remotamente.

## Task 6 — APIs autenticadas

**Arquivos:**

- Criar `src/app/api/ai/models/route.ts`.
- Modificar `src/app/api/ai/conversations/route.ts` e `src/app/api/ai/chat/route.ts`.
- Modificar `tests/ai-conversation-routes.test.ts`.

1. Criar RED para 401, validação de preferência, ownership e persistência de telemetria.
2. Implementar catálogo seguro e persistência da preferência na conversa.
3. Sob feature flag, executar roteador/broker; com flag desligada, preservar fluxo antigo.
4. Revalidar modelo no servidor e persistir usage/tentativas/plano sem conteúdo sensível.
5. Rodar testes das rotas.

## Task 7 — UI independente e observável

**Arquivos:**

- Criar `src/components/AiModelPicker.tsx`.
- Modificar `src/app/agentes/AgentChatWorkspace.tsx` e `src/app/globals.css`.
- Modificar `tests/ai-agents-ui.test.ts`.

1. Criar RED estático/behavioral para seletor independente e default automático.
2. Carregar catálogo autenticado; exibir nome, contexto real e indisponibilidade.
3. Persistir seleção sem alterar especialista; enviar apenas preferência validável.
4. Exibir modelo efetivo, usage, latência, fontes, truncamentos e falha de cota.
5. Validar desktop e viewport móvel.

## Task 8 — CLI somente leitura

**Arquivos:**

- Criar `scripts/ai-chat-query.mjs` e teste correspondente.
- Modificar `package.json` e `.env.example`.

1. Criar RED para argumentos/intents inválidos e modo somente leitura.
2. Implementar impressão de plano, fontes, cortes e limitações sem inferência obrigatória.
3. Adicionar `ai:query` e documentar a feature flag.

## Task 9 — Fechamento local

1. Rodar testes focados a cada ciclo e depois `npm.cmd test`.
2. Rodar `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build`.
3. Rodar `npm.cmd audit --omit=dev` como checagem separada.
4. Revisar diff somente da Story 055 e confirmar que os arquivos já sujos do usuário não
   foram alterados.
5. Atualizar checklist, Debug Log, Completion Notes e File List; marcar `Ready for Review`
   apenas quando os critérios locais estiverem concluídos.
6. Reportar migration remota, push, deploy e smoke real como pendentes se não executados.
