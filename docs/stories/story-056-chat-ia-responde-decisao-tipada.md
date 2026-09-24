# Story 056 — Chat de IA que responde, com decisão tipada

## Status

Ready for Review (falta deploy de preview e confirmar que a conta Groq está no plano gratuito)

## Story

Como operador do CRM, quero que o chat de `/agentes` responda de verdade às perguntas
abertas ("me dá o relatório de como estão as coisas"), sem morrer quando um modelo gratuito
trava, para usar o chat no dia a dia em vez de desistir dele.

## Contexto

Medido em 24/09/2026 no banco (`ai_conversation_messages`): existe uma conversa (21/09)
com duas perguntas, e as duas falharam por timeout. Nenhuma resposta do chat foi gravada até hoje.

- A pergunta "me da o relatorio de como estão as coisas" caiu em `unknown` no roteador por
  regex (`aiQueryRouter.ts`) e o broker carregou zero dados do CRM.
- O primeiro modelo gratuito do OpenRouter travou 45 s. A cascata (`aiProviders.mjs`)
  propagava o `TimeoutError` em vez de tentar o próximo modelo, e a tentativa não era
  registrada (`provider_attempts` vazio).
- O chat só tentava OpenRouter (`freeOnly`), sem reserva.

O problema não era janela de contexto: o prompt que foi enviado estava quase vazio.

Esta story introduz o contrato de **decisão tipada** (`choice` / `score` / `boolean` validados
contra listas fechadas), no mesmo formato do endpoint `/v1/evaluate` do Vercel AI Gateway
(modelo Jev, da TypeSafe). Hoje as respostas vêm de regras e dos modelos gratuitos. O
adaptador do Jev fica fora de escopo, por decisão do Erick em 24/09/2026. As stories 057
(leitura do WhatsApp) e 058 (ICP) reutilizam o mesmo contrato.

### Revisão de critério da Story 055

O AC 14 da 055 ("não existe fallback pago") excluía o Groq porque o catálogo não comprova
preço zero. Em 24/09/2026 o Erick decidiu **liberar o Groq como reserva do chat** (plano
gratuito). O modo automático tenta primeiro o OpenRouter gratuito e só então o Groq. O modo de
modelo fixo continua exclusivamente OpenRouter gratuito (AC 13 da 055 intacto).
Pré-requisito operacional: a conta Groq estar no plano gratuito, sem cartão.

## Acceptance Criteria

- [x] 1. Timeout de um modelo registra a tentativa (`reason: "timeout"`) e a cascata segue
      para o próximo modelo, dentro de um prazo total.
- [x] 2. Cancelamento pelo chamador ou fim do prazo total encerra a cascata **sem lançar erro**
      e devolve as tentativas registradas.
- [x] 3. `providerPolicy: "free-then-groq"` tenta OpenRouter gratuito e depois Groq.
      `"free-strict"` (e o alias `freeOnly: true`) nunca chama Groq.
- [x] 4. Modo de modelo fixo continua só OpenRouter gratuito, mesmo com `free-then-groq`.
- [x] 5. O chat usa `free-then-groq`, timeout por modelo de 15 s
      (`AI_CHAT_PER_MODEL_TIMEOUT_MS`) e prazo total abaixo do `maxDuration`.
- [x] 6. Nova intenção `pipeline_overview` ("relatório", "como estão as coisas", "panorama",
      "resumo geral", "situação", "funil") carrega o escopo `reports` já agregado (pipeline,
      forecast, perdas), com teto de contexto.
- [x] 7. Quando a regex devolve `unknown`, uma decisão tipada escolhe entre as intenções
      fechadas. O resultado passa por `normalizeAiQueryPlan`. Falha ou dúvida mantém `unknown`
      com contexto mínimo (AC 8 da 055 preservado).
- [x] 8. `routing_plan` registra `decidedBy: "regra" | "llm"`.
- [x] 9. `decide()` rejeita valor fora da lista (vira `null`), JSON quebrado e evidência que
      não aparece no estado.
- [x] 10. `classify-conversations.mjs` passa a importar `extrairJson`/checagem de evidência do
      módulo comum, sem mudar o comportamento.
- [x] 11. Testes, lint, typecheck e build passam. (`npm test` 558/558, eslint 0 erros, tsc
      limpo, `npm run build` OK após `ai:dna:sync`)

## Tasks / Subtasks

- [x] `src/lib/typedDecision.mjs` + `.d.mts` (contrato, prompt JSON, validação, `callBackend`).
- [x] `aiProviders.mjs`: `perModelTimeoutMs`, `perProviderTimeoutMs`, prazo total,
      `timeout`/`cancelled` classificados, `providerPolicy`.
- [x] `aiQueryRouter.ts` + `aiRetrievalBroker.ts`: `pipeline_overview`.
- [x] `src/lib/aiQueryPlanner.ts`: regex primeiro, decisão tipada no `unknown`.
- [x] `api/ai/chat/route.ts`: política, timeouts, `decidedBy`.
- [x] `scripts/ai-chat-query.mjs`: mesmo planejador do chat.
- [x] Testes: `ai-providers`, `ai-query-router`, `typed-decision`, `ai-query-planner`,
      `ai-conversation-routes`.

## Fora de escopo

- Adaptador do Jev (`POST ai-gateway.vercel.sh/v1/evaluate`).
- Fine-tuning.

## Dev Agent Record

### Agent Model Used

claude-opus-5-5

### Completion Notes List

- `timeoutMs` da cascata virou prazo TOTAL. Antes, cada chamada ganhava um timeout novo e o
  primeiro estouro lançava erro. Chamadores (copiloto, doctor, CLIs) já tratavam `null`.
- Sem orçamento por provedor, 4 modelos do OpenRouter a 15 s cada consumiriam o prazo inteiro
  antes do Groq. O chat reserva 60% do prazo para o OpenRouter.
- A regex antiga liga o playbook por qualquer "mensagem" na pergunta. Com decisão tipada
  escolhendo uma intenção de dados, vale só o booleano da decisão.
- Smoke real em 24/09/2026 (só leitura):
  - `ai:query "me da o relatorio de como estão as coisas"` → `pipeline_overview` por regra.
    Carrega funil, forecast, perdas e a fila (10 WhatsApp, 3 e-mails, 152 follow-ups
    vencidos), cerca de 3k caracteres.
  - "quem me mandou mensagem no zap essa semana?" → `whatsapp_replies`/`last_7_days` pela
    decisão tipada (4,5 s).
  - "o que e ICP?" → `unknown` pela decisão tipada (2,7 s).
  - A cascata respondeu pelo OpenRouter gratuito em 2 s.
- Testes: `test:ai-chat` 86/86. `tsc --noEmit` e eslint limpos.
- O build travava na checagem de DNA porque a persona `webson-vendedor` mudou no aios-core
  (commit `968f100b`). `npm run ai:dna:sync` regenerou os dois arquivos gerados, uma diferença
  de 9 linhas, só no webson. Esse drift existia antes desta story.

### File List

- `docs/stories/story-056-chat-ia-responde-decisao-tipada.md`
- `src/lib/typedDecision.mjs` (novo)
- `src/lib/typedDecision.d.mts` (novo)
- `src/lib/aiQueryPlanner.ts` (novo)
- `src/lib/aiProviders.mjs`
- `src/lib/aiProviders.d.mts`
- `src/lib/aiQueryRouter.ts`
- `src/lib/aiRetrievalBroker.ts`
- `src/app/api/ai/chat/route.ts`
- `scripts/ai-chat-query.mjs`
- `scripts/classify-conversations.mjs`
- `tests/typed-decision.test.ts` (novo)
- `tests/ai-query-planner.test.ts` (novo)
- `tests/ai-providers.test.ts`
- `tests/ai-query-router.test.ts`
- `tests/ai-conversation-routes.test.ts`
- `package.json`
- `content/agentes.json` e `content/ai-agents/manifest.json`
- `src/server/aiAgentPersonas.generated.mjs` e `src/lib/aiAgentRegistry.generated.ts`
  (regenerados por `ai:dna:sync`)

## Change Log

- 2026-09-24: Story criada a partir do diagnóstico do chat (2/2 falhas por timeout).
- 2026-09-24: Implementação local concluída, testes e smoke real OK. Falta build, deploy de
  preview e confirmar que a conta Groq está no plano gratuito.
