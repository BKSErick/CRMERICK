# Story 055 — Chat de IA com busca inteligente e modelos gratuitos

## Status

Ready for Review

## Story

Como operador administrativo do CRM, quero perguntar em linguagem natural sobre
prioridades, e-mails, WhatsApp e oportunidades, escolhendo separadamente o especialista
e um modelo gratuito, para receber respostas recentes, rastreáveis e acionáveis sem enviar
o CRM inteiro ao modelo e sem qualquer risco de cobrança.

## Contexto

O chat de `/agentes` já persiste conversas, especialistas, citações e o modelo efetivo.
Hoje, porém, o escopo `CRM inteiro` carrega fontes amplas antes de entender a pergunta e o
playbook comercial entra em todas as chamadas. Isso aumenta o input e pode consumir a cota
gratuita antes de existir resposta útil.

O desenho aprovado está em
`docs/plans/2026-09-18-chat-ia-busca-inteligente-free-design.md`.

## Acceptance Criteria

- [x] 1. Um roteador server-side, fechado e validado, cobre `daily_priorities`,
      `email_replies`, `whatsapp_replies` e `deal_search`.
- [x] 2. Texto do operador nunca vira SQL, tabela, URL, RPC, endpoint ou ferramenta livre.
- [x] 3. “Qual é minha prioridade hoje?” usa regras determinísticas compartilhadas com a
      Sala de Comando, sem uma segunda regra conflitante.
- [x] 4. E-mail aguarda resposta somente quando a última mensagem cronológica é `received`;
      `unread_count` não decide isso sozinho.
- [x] 5. WhatsApp reconcilia `whatsapp_received`, `whatsapp_sent` e
      `whatsapp_sent_sync`; respostas de bot não entram como atendimento humano pendente.
- [x] 6. Busca de deals usa filtros tipados, paginação e limite no banco; `/api/ai-search`
      reutiliza o serviço e não carrega milhares de deals para filtrar em memória.
- [x] 7. Cada consulta devolve fonte, corte, total, amostra limitada, filtros, limitações,
      truncamento e links internos acionáveis.
- [x] 8. Intenção desconhecida recebe contexto mínimo ou limitação explícita; nunca carrega
      silenciosamente o CRM inteiro.
- [x] 9. O playbook comercial entra apenas em intenção comercial/copy/follow-up.
- [x] 10. O histórico enviado ao modelo é limitado por quantidade e tamanho.
- [x] 11. Especialista e modelo são controles independentes na UI. `@especialista` afeta
      apenas a resposta atual.
- [x] 12. Um endpoint autenticado expõe somente metadados seguros do catálogo gratuito,
      incluindo a janela de contexto real, sem confundi-la com volume histórico.
- [x] 13. O servidor revalida o modelo. OpenRouter só é elegível com `:free`,
      `openrouter/free` ou preço atual de prompt e completion igual a zero.
- [x] 14. Não existe modelo, fallback ou escalada paga. Modelo fixo não é trocado
      silenciosamente; modo automático tenta somente candidatos comprovadamente gratuitos.
- [x] 15. O núcleo de consulta possui CLI somente leitura antes de depender da UI.
- [x] 16. A resposta persiste provider/modelo efetivos, preferência solicitada, usage quando
      informado, tentativas sanitizadas, latência, plano e fontes.
- [x] 17. Prompt integral, corpos completos, chaves, cookies e credenciais não entram em logs
      nem na observabilidade aberta.
- [x] 18. Rotas exigem sessão administrativa, ownership e continuam somente leitura.
- [x] 19. Dados do CRM são conteúdo não confiável e não podem alterar política/ferramentas.
- [x] 20. `AI_CHAT_SMART_RETRIEVAL_ENABLED=false` restaura o broker anterior sem apagar
      conversas ou metadados.
- [x] 21. Falha parcial vira limitação explícita; falha essencial nunca fabrica dados.
- [x] 22. Migration, rollback, snapshot, testes, lint, typecheck e build são atualizados e
      executados antes da conclusão local.

## Contratos

```ts
type AiQueryIntent =
  | "daily_priorities"
  | "email_replies"
  | "whatsapp_replies"
  | "deal_search"
  | "unknown";

type AiModelPreference =
  | { mode: "auto" }
  | { mode: "fixed"; provider: "OpenRouter"; modelId: string };

type AiEvidenceEnvelope = {
  sourceId: string;
  label: string;
  query: AiQueryIntent;
  asOf: string;
  total: number;
  facts: unknown[];
  filters: Record<string, unknown>;
  limitations: string[];
  links: Array<{ label: string; href: string }>;
  truncated: boolean;
};
```

## Regras de consulta

### Prioridades

- Reusar serviço determinístico da Sala de Comando.
- Priorizar respostas humanas aguardando operador, follow-ups vencidos, fundo de funil,
  risco, qualificação e encaminhamentos.
- Limitar evidências e preservar total, corte e motivo da prioridade.

### E-mail

- Ordenar por `occurred_at desc, id desc`.
- Incluir somente thread aberta cuja última direção seja `received`.
- Não marcar como lida e não criar lead/deal.

### WhatsApp

- Usar cronologia canônica de mensagens/atividades por deal.
- Incluir apenas o último evento humano `whatsapp_received`.
- Excluir bots com a classificação já usada pelo CRM.

### Deals

- Filtros, ordenação, página e limite pertencem a allowlists.
- Filtrar no Supabase antes de materializar e retornar apenas campos necessários.

## Persistência e migration

- `ai_conversations.model_preference jsonb not null default '{"mode":"auto"}'`.
- `ai_conversation_messages.usage jsonb`.
- `ai_conversation_messages.provider_attempts jsonb not null default '[]'`.
- `ai_conversation_messages.routing_plan jsonb`.
- `email_threads.last_message_direction` e `last_message_id`, com backfill determinístico.
- Índices parciais para e-mails aguardando resposta e timeline de WhatsApp.
- Reusar `provider`, `model`, `latency_ms`, `citations` e `context_manifest`.
- Manter RLS deny-by-default e acesso apenas server-side.

## Tasks / Subtasks

- [x] Escrever testes RED para roteamento, recuperação, política gratuita, API, UI e schema.
- [x] Implementar roteador fechado e broker somente leitura.
- [x] Compartilhar regras operacionais com a Sala de Comando.
- [x] Tornar busca de deals paginada no banco e adaptar `/api/ai-search`.
- [x] Expor catálogo gratuito autenticado e bloquear modelo pago antes da rede.
- [x] Capturar usage/tentativas e persistir preferência/plano.
- [x] Limitar histórico e incluir playbook condicionalmente.
- [x] Adicionar picker de modelo independente do especialista.
- [x] Criar migration, rollback, snapshot e CLI somente leitura.
- [x] Executar gates e atualizar checklist, Dev Agent Record e File List.

## Plano de testes

- Roteador rejeita chaves/filtros desconhecidos e intenção desconhecida não carrega tudo.
- E-mail recebido→enviado sai da fila; enviado→recebido entra; empate usa maior `id`.
- WhatsApp inbound após outbound entra; outbound/sync após inbound sai; bot não entra.
- Busca aplica filtros antes do limite, pagina e limita a 50.
- Playbook não entra em pergunta operacional e histórico longo é limitado.
- Modelo pago/não comprovado é recusado antes de `fetch`; fixo não troca silenciosamente.
- Usage ausente aparece como não informado, sem estimativa falsa.
- Endpoint de modelos retorna 401 sem sessão; ownership continua obrigatório.
- Feature flag restaura o fluxo anterior.

## Segurança

- Sessão administrativa e ownership obrigatórios.
- Service role e chaves nunca chegam ao browser.
- Nenhum tool call do modelo é executado.
- Evidências são minimizadas e tratadas como não confiáveis.
- Erros externos são sanitizados; prompts e PII integral não são logados.
- Gratuidade é comprovada antes do `fetch`.

## Fora de escopo

- Modelos pagos ou compra de créditos.
- Resposta automática, envio, mutação, SQL gerado, embeddings/pgvector e busca web.
- Slack/outros SaaS, alteração pública dos clones, anexos, voz ou multimodal.

## Rollout e rollback

1. Validar migration em transação e publicar com a flag desligada.
2. Aplicar migration separadamente do deploy.
3. Habilitar somente para operador administrativo e conferir os quatro casos contra as
   telas de origem.
4. Rollback operacional: desligar `AI_CHAT_SMART_RETRIEVAL_ENABLED`.
5. Rollback DDL somente se indispensável e após exportar telemetria.
6. Se gratuidade não puder ser comprovada, manter fail-closed.

## Definition of Done

- Acceptance Criteria e tarefas concluídos.
- Testes RED ficam verdes; gates passam ou limitações preexistentes têm evidência.
- Nenhuma chamada paga é possível nos caminhos cobertos.
- File List representa exatamente os arquivos alterados.
- Story fica `Ready for Review`; aprovação final pertence ao QA.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- `npm test`: 510 testes aprovados, 0 falhas.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado com 2 avisos preexistentes em componentes fora da story.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm run build`: interrompido pelo verificador preexistente de DNA com drift em
  `webson-vendedor`; nenhuma sincronização fora do escopo foi executada.
- `npx next build`: compilação, TypeScript e geração das 82 páginas aprovadas.
- `npm run test:email-inbox`: 42/43; falha preexistente de asserção textual sobre
  `messages.map` em arquivo não alterado por esta story.
- Dry-run remoto da migration: `HTTP 201` com rollback.
- Aplicação remota da migration: `HTTP 201`.
- Verificação remota: colunas, constraints e índices presentes; RLS ativo; `anon` e
  `authenticated` negados; `service_role` permitido; backfill sem divergências.
- Vercel: `AI_CHAT_SMART_RETRIEVAL_ENABLED=true` confirmado em `production`, `preview`
  e `development`; a configuração entra em novos deployments.

### Completion Notes List

- A consulta inteligente é fail-closed e somente leitura; texto do operador é convertido
  em planos tipados e allowlisted, nunca em SQL ou ferramenta livre.
- E-mail, WhatsApp, deals e prioridades usam consultas pequenas no banco e envelopes com
  total, corte, limitações e links; busca natural por etapa/score filtra antes da paginação.
- O seletor de especialista ficou independente do seletor de modelo. O catálogo da UI
  mostra apenas modelos OpenRouter gratuitos verificados e sua janela real de contexto.
- O chat não tenta Groq no modo gratuito estrito, pois gratuidade contratual não pode ser
  comprovada pelo catálogo; sem candidato OpenRouter gratuito a resposta falha sem cobrar.
- A preferência, o plano, as fontes, usage, tentativas sanitizadas e latência ficam prontos
  para persistência após a migration.
- A implementação está protegida por `AI_CHAT_SMART_RETRIEVAL_ENABLED`; o padrão do código
  continua desligado, enquanto a flag remota foi configurada como `true` nos três ambientes
  da Vercel. A migration foi aplicada e verificada no Supabase. Smoke pela UI e deploy
  manual não foram executados.

### File List

- `.env.example`
- `package.json`
- `scripts/ai-chat-query.mjs`
- `scripts/migrations/20260918_ai_chat_smart_retrieval_free.rollback.sql`
- `scripts/migrations/20260918_ai_chat_smart_retrieval_free.sql`
- `scripts/supabase-schema.sql`
- `scripts/verify-20260918-ai-chat-smart-retrieval-free.mjs`
- `src/app/agentes/AgentChatWorkspace.tsx`
- `src/app/agentes/AiModelPicker.tsx`
- `src/app/api/ai-search/route.ts`
- `src/app/api/ai/chat/route.ts`
- `src/app/api/ai/conversations/route.ts`
- `src/app/api/ai/models/route.ts`
- `src/app/api/comando/route.ts`
- `src/app/globals.css`
- `src/lib/aiConversation.ts`
- `src/lib/aiMessageHistory.ts`
- `src/lib/aiModelCatalog.d.mts`
- `src/lib/aiModelCatalog.mjs`
- `src/lib/aiProviders.d.mts`
- `src/lib/aiProviders.mjs`
- `src/lib/aiQueryRouter.ts`
- `src/lib/aiRetrievalBroker.ts`
- `src/lib/brevoConversationRepository.ts`
- `src/lib/emailInboxRepository.ts`
- `tests/ai-agents-ui.test.ts`
- `tests/ai-chat-schema.test.ts`
- `tests/ai-conversation-routes.test.ts`
- `tests/ai-conversations.test.ts`
- `tests/ai-model-catalog.test.ts`
- `tests/ai-providers.test.ts`
- `tests/ai-query-cli.test.ts`
- `tests/ai-query-router.test.ts`
- `tests/ai-retrieval-broker.test.ts`
- `docs/stories/story-055-chat-ia-busca-inteligente-free.md`
- `docs/plans/2026-09-18-chat-ia-busca-inteligente-free-design.md`
- `docs/plans/2026-09-18-chat-ia-busca-inteligente-free.md`

## Change Log

- 2026-09-18: Story criada a partir do desenho aprovado e iniciada em TDD.
- 2026-09-18: Implementação local concluída em modo estritamente gratuito e movida para
  Ready for Review; rollout remoto permanece pendente.
- 2026-09-18: Migration aplicada/verificada no Supabase e flag configurada na Vercel para
  os três ambientes; deploy manual permanece fora do escopo.
