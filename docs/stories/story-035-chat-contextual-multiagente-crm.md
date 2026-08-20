# Story 035 - Chat contextual multiagente na aba Agentes de IA

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@architect`
- Apoio: `@qa`, `@data-engineer`, `@cyber-chief`, `@ux-design-expert`

## Story

Como operador do CRM, quero conversar com especialistas de IA dentro da aba
existente `Agentes de IA`, usando os dados autorizados do CRM, integrações e
relatórios, para fazer perguntas gerais ou análises específicas sob o DNA de
Copy Chief, Willian Celso, Thiago Finch, Alex Hormozi e outros especialistas
relevantes sem sair do Hub Operacional.

## Contexto

`/agentes` é hoje um catálogo server-rendered alimentado por
`content/agentes.json`. Os seis cards são conceituais e não possuem conversa,
histórico, seleção de persona ou acesso contextual. Em paralelo, a Story 032
entregou um copiloto comercial determinístico, `/api/ai`, minimização de contexto,
evidências, provider com fallback e limites explícitos de autoridade.

Esta story transforma a superfície existente em um workspace de chat. Não deve
ser criada outra aba principal. O catálogo continua disponível como seletor de
especialistas e a conversa ocupa a mesma rota `/agentes`.

O objetivo não é liberar SQL ou ferramentas arbitrárias para o modelo. O backend
oferece um conjunto fechado de fontes somente leitura, monta o contexto mínimo,
executa cálculos determinísticos existentes e exige que a resposta cite de onde
vieram os dados. O especialista altera lente, frameworks, perguntas de análise e
tom; ele não altera fatos nem ganha autoridade operacional.

## Decisões aprovadas

- O chat entra na aba já existente `Agentes de IA`.
- Deve ser possível chamar um especialista por modal/lista e por atalho `@`.
- Cada especialista usa prompt, DNA, frameworks e limites próprios.
- O chat pode analisar CRM, integrações e relatórios.
- Em 2026-08-20, o operador autorizou explicitamente a implementação completa,
  a aplicação das migrations e a abertura do ambiente local.

## Catálogo inicial obrigatório

| ID | Nome na interface | Atalho | Especialidade | Fonte canônica |
| --- | --- | --- | --- | --- |
| `crm-copilot` | CRM Copilot | `@geral` | visão transversal, triagem e síntese do CRM | `src/lib/salesCopilot.mjs` e `src/lib/salesCopilotService.mjs` |
| `copy-chief` | Copy Chief | `@copy` | copy, persuasão, páginas, anúncios, VSL e auditoria | AIOS `.aios-core/development/agents/copy-chief.md` |
| `willian-celso` | Willian Celso | `@willian` | arquétipos, identidade, posicionamento e comunicação de marca | AIOS `experts/willian_celso/clone_willian_celso.yaml` |
| `thiago-finch` | Thiago Finch | `@finch` | funis, produto digital, aquisição e escala | AIOS `experts/thiago_finch/clone_thiago_finch.yaml` |
| `alex-hormozi` | Alex Hormozi | `@hormozi` | oferta, pricing, aquisição, leads, LTV e escala | AIOS `experts/alex_hormozi/clone_alex_hormozi.yaml` |
| `webson-vendedor` | Webson Vendedor | `@webson` | vendas consultivas, objeções, follow-up e fechamento | AIOS `.aios-core/development/agents/webson-vendedor.md` |
| `data-chief` | Data Chief | `@dados` | métricas, relatórios, coortes, forecast e North Star | AIOS `.aios-core/development/agents/data-chief.md` |

O registro deve ser extensível para adicionar especialistas sem alterar o layout
ou criar condicionais por agente. Novos especialistas só entram após possuir
fonte canônica, versão, escopo, prompt testável e atalhos sem colisão.

## Proveniência do prompt e DNA

- Clones usam os YAMLs raiz em `experts/<slug>/clone_<slug>.yaml`; arquivos
  gerados em `.aios-core/development/agents/` não são editados manualmente.
- Agentes funcionais usam a definição canônica em
  `.aios-core/development/agents/<id>.md`.
- Um sincronizador explícito gera snapshots server-side versionados no CRM com
  `agentId`, `sourcePath`, `sourceVersion`, `sourceHash`, `syncedAt`, identidade,
  frameworks, tom, limites e instruções relevantes para conversa.
- Comandos, permissões de terminal, Git, ClickUp, ferramentas e autoridade do
  agente AIOS não são importados para o chat. Somente o DNA consultivo aprovado
  compõe o system prompt.
- Prompts completos e DNA não são enviados ao browser, incluídos em respostas da
  API ou expostos em source maps. A UI recebe apenas metadados públicos do card.
- O build da Vercel não depende de acessar o checkout local do AIOS. Snapshots
  sincronizados e revisados são versionados no CRM; drift é detectado por hash e
  falha em um comando de verificação, nunca atualizado silenciosamente no build.
- A interface identifica claramente cada persona como `Especialista de IA` ou
  `Clone de IA baseado na metodologia de ...`, sem afirmar que a pessoa real
  participa da conversa.

## Experiência de uso

### Estrutura

```text
Agentes de IA

[Nova conversa] [Especialista: CRM Copilot v] [Escopo: CRM inteiro v]

Conversas                  Chat
- Revisão do funil         [CRM Copilot]
- Oferta OStrack           Pergunte sobre deals, relatórios e integrações...
- Posicionamento Erick

Especialistas              Fontes usadas nesta resposta
- Copy Chief               - Pipeline, atualizado às 10:32
- Willian Celso            - Forecast 30 dias
- Thiago Finch             - Instagram 30 dias
- Alex Hormozi
- Webson
- Data Chief
```

### Chamada de especialista

- O seletor/modal define o especialista padrão da conversa.
- Digitar `@` abre uma lista filtrável com nome, atalho e especialidade.
- Um `@atalho` no início da mensagem chama aquele especialista somente para a
  resposta atual; o padrão da conversa não muda sem ação explícita no seletor.
- A resposta mostra avatar/nome, versão do DNA, escopo consultado, horário de
  corte e fontes utilizadas.
- O usuário pode abrir uma fonte citada e, quando aplicável, navegar para
  `/pipeline?dealId=<id>`, relatório ou módulo relacionado.
- Sugestões iniciais mudam conforme o especialista, por exemplo: Copy Chief
  oferece auditoria de copy; Data Chief oferece funil/forecast; Webson oferece
  análise de objeção. Sugestões são prompts, não ações automáticas.

## Escopos de contexto

O usuário escolhe um dos escopos abaixo. O backend nunca interpreta o texto como
autorização para acessar fonte fora do escopo.

- `CRM inteiro`: agregados e fontes autorizadas em todos os módulos.
- `Deal específico`: deal, contato relacionado, atividades, mensagens,
  qualificação, saúde, forecast, insights e demandas autorizadas daquele deal.
- `Relatórios`: funil, forecast, perdas, North Star, análises e métricas.
- `Integrações`: estado e dados permitidos de Instagram, WhatsApp/Uazapi,
  Threads, Pixel/Analytics e demais integrações existentes.
- `Conteúdo e marca`: conteúdo sincronizado, Brandbook, Brain e Achados.

`CRM inteiro` não significa despejar tabelas completas no prompt. Um roteador
determinístico escolhe providers de contexto permitidos, aplica filtros,
paginação, agregação e minimização e só então chama o modelo.

## Fontes de contexto permitidas

- Deals, contatos, atividades e mensagens por consultas server-side aprovadas.
- Serviços determinísticos de saúde do deal, qualificação, forecast, perdas,
  automação comercial e Sales Copilot.
- Rotas/serviços de `comando`, `funnel`, `north-star`, `analise`, `insights`,
  `instagram`, `threads`, `google-analytics` e `facebook-pixel` quando disponíveis.
- Conteúdo local/sincronizado de Brain, Brandbook, Carteira, Conteúdo e Achados.
- Status sanitizado das integrações: conectado, indisponível, desatualizado ou
  não configurado, sem devolver token, segredo, header ou variável de ambiente.

Cada provider retorna um envelope comum: `sourceId`, `label`, `asOf`, `scope`,
`facts`, `limitations` e links internos autorizados. Falha em uma fonte gera uma
limitação citada e não derruba a conversa inteira.

## Modelo de persistência proposto

### `public.ai_conversations`

- `id uuid primary key`
- `title text not null`
- `default_agent_id text not null`
- `context_scope jsonb not null`
- `created_by text not null`
- `created_at`, `updated_at`, `archived_at`

### `public.ai_conversation_messages`

- `id uuid primary key`
- `conversation_id uuid` com FK e exclusão controlada
- `role text`: `user`, `assistant`, `system_event`
- `agent_id text`
- `content text`
- `citations jsonb`
- `context_manifest jsonb` com IDs, cortes e limitações, sem payload sensível
- `provider`, `model`, `prompt_version`, `source_hash`
- `status text`: `pending`, `complete`, `failed`, `cancelled`
- `created_at`

Conversas e mensagens possuem RLS deny-by-default. Leitura, criação, renomeação,
arquivamento e exclusão passam por rota server-side autenticada. Exclusão é
explícita e não é usada como limpeza automática silenciosa.

## Limites de autoridade e segurança

- MVP é somente leitura sobre o CRM e as integrações.
- O chat pode explicar, comparar, resumir, calcular por serviços determinísticos
  e produzir rascunhos. Não pode enviar mensagem, publicar conteúdo, mover deal,
  alterar preço/status, criar demanda, configurar integração ou aplicar SQL.
- Nenhuma saída do modelo é executada como comando, query, URL ou chamada de API.
- Texto vindo de mensagens, notas, páginas e arquivos do CRM é dado não confiável;
  instruções embutidas nele não podem substituir system prompt ou política.
- Telefones, e-mails e identificadores pessoais são minimizados por padrão. Um
  dado identificável só aparece quando necessário ao escopo explícito e permitido
  pela sessão; nunca é enviado ao provider sem necessidade.
- Tokens, cookies, service-role, prompts completos, headers e variáveis de
  ambiente são sempre proibidos no contexto e na resposta.
- Toda resposta distingue fato do CRM, cálculo determinístico, inferência e
  recomendação da persona. Número sem fonte/corte é inválido.
- Custos e latência ficam observáveis por conversa e mensagem, sem gravar prompt
  sensível em log aberto.

## Acceptance Criteria

- [ ] `/agentes` mantém o catálogo existente e adiciona uma superfície de chat,
  histórico de conversas, seletor de contexto e seletor de especialista sem
  criar nova entrada no menu principal.
- [ ] O catálogo inicial contém exatamente os sete perfis obrigatórios desta
  story, com nome, atalho, especialidade, tipo (`agente`/`clone`), versão e fonte
  canônica exibível.
- [ ] Copy Chief, Webson e Data Chief são sincronizados de suas definições
  canônicas; Willian Celso, Thiago Finch e Alex Hormozi são sincronizados dos
  YAMLs raiz em `experts/`; CRM Copilot reutiliza o núcleo da Story 032.
- [ ] Um comando CLI sincroniza os snapshots permitidos e outro comando verifica
  drift de `sourceHash`; o build falha se snapshot obrigatório estiver ausente,
  inválido ou com versão/hash inconsistente, mas nunca altera snapshot sozinho.
- [ ] O extrator de DNA importa identidade, frameworks, tom, perguntas e limites,
  e prova por teste que comandos, ferramentas, secrets e permissões operacionais
  do AIOS não entram no prompt conversacional.
- [ ] O system prompt efetivo é montado apenas no servidor e combina, em ordem
  explícita: política imutável do CRM, limites de autoridade, DNA versionado,
  escopo solicitado, fatos/citações e pergunta do usuário.
- [ ] O seletor/modal troca o especialista padrão da conversa; `@` abre picker
  acessível e os sete atalhos funcionam sem colisão.
- [ ] Um atalho no início da mensagem vale apenas para aquela resposta e não
  altera silenciosamente o especialista padrão; a UI deixa isso visível antes e
  depois do envio.
- [ ] O usuário consegue criar, renomear, listar, reabrir, arquivar e excluir
  conversas; recarregar a página preserva histórico e especialista padrão.
- [ ] Cada resposta persiste agente, provider/model, versão/hash do DNA, corte das
  fontes, citações, limitações e estado de execução, sem persistir secrets.
- [ ] O backend possui registro fechado de providers de contexto e não executa
  SQL, endpoint ou ferramenta sugeridos pelo modelo.
- [ ] `CRM inteiro`, `Deal específico`, `Relatórios`, `Integrações` e `Conteúdo e
  marca` aplicam fontes e limites próprios; `Deal específico` exige um deal
  válido e autorizado.
- [ ] Perguntas sobre funil, forecast, saúde, perdas e métricas reutilizam cálculos
  determinísticos existentes. O modelo narra/interpreta e não recalcula números
  a partir de texto bruto.
- [ ] Perguntas sobre integrações informam disponibilidade e atualização com
  degradação segura; ausência de token/configuração é descrita sem revelar valor
  ou nome sensível de variável.
- [ ] Respostas exibem citações acionáveis próximas às alegações, horário de
  corte e limitações; quando não houver dados suficientes, dizem isso em vez de
  completar com suposição.
- [ ] O mesmo conjunto factual entregue a especialistas diferentes preserva os
  números e fontes; apenas lente, framework, perguntas e recomendação mudam.
- [ ] A UI identifica clones como IA baseada em metodologia e não representa a
  conversa como contato com a pessoa real.
- [ ] Prompt injection presente em notas, mensagens, páginas ou conteúdo não
  altera política, agente, escopo nem autoridade e é coberta por teste negativo.
- [ ] Falha/timeout do provider de IA ou de uma fonte não quebra `/agentes`:
  mensagem fica com status observável, retry é controlado e fontes disponíveis
  continuam utilizáveis.
- [ ] Nenhuma ação de escrita no CRM ou integração pode ser representada ou
  executada pelo contrato desta story; testes tentam enviar mensagem, mover deal,
  criar demanda, publicar e configurar integração e recebem recusa.
- [ ] A rota exige sessão administrativa para listar contexto e conversar; IDs
  alheios, enumeração de conversa e deep links sem sessão retornam erro seguro.
- [ ] A interface funciona por teclado, possui foco visível, anúncio de resposta
  em streaming/carregamento, cancelamento, retry e layout desktop/mobile.
- [ ] Existe limite configurável de contexto, mensagens e uso por requisição;
  truncamento é determinístico, prioriza fatos/citações recentes e é informado.
- [ ] Migration, manifestos, snapshots, schema consolidado, API e documentação
  ficam sincronizados; nenhum dado ou conversa fictícia entra em produção.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir contratos e testes RED do registro multiagente (AC: 2-8).
  - [x] Definir schema versionado de metadados públicos e DNA server-side.
  - [x] Implementar fixtures que provem hash, versão, atalhos e remoção de
    comandos/permissões do AIOS.
- [x] Criar pipeline explícito de sincronização AIOS -> CRM (AC: 3-6).
  - [x] Ler apenas a allowlist de fontes canônicas.
  - [x] Gerar snapshots determinísticos e manifest com hash.
  - [x] Implementar `sync` e `check` CLI sem dependência cross-repo no build.
- [x] Criar migration e repositório de conversas (AC: 9-10, 21, 24).
  - [x] Criar tabelas, checks, FKs, índices e RLS deny-by-default.
  - [x] Implementar CRUD autenticado, paginação e ownership administrativo.
- [x] Implementar broker de contexto somente leitura (AC: 11-16, 23).
  - [x] Registrar providers permitidos e envelope comum de evidência.
  - [x] Reutilizar serviços determinísticos e minimizar dados antes do provider.
  - [x] Implementar falha parcial, corte temporal, citações e limites.
- [x] Implementar orquestração segura do prompt (AC: 5-6, 16-20).
  - [x] Compor política, DNA, contexto e pergunta em camadas não sobrescrevíveis.
  - [x] Reutilizar provider/fallback/timeout existentes.
  - [x] Rejeitar tool calls, ações de escrita e conteúdo instrucional injetado.
- [x] Evoluir `/agentes` para workspace de chat (AC: 1, 7-10, 15, 17, 22).
  - [x] Preservar catálogo e criar histórico, nova conversa e estados vazios.
  - [x] Criar seletor/modal e picker por `@` com atalhos.
  - [x] Exibir citações, fonte, versão, limitações, loading, cancelar e retry.
- [x] Executar testes de segurança, acessibilidade, responsividade e custo (AC: 18-24).
- [x] Executar quality gates e atualizar checklist/File List da story (AC: 25).

## Fora de escopo

- Criar nova aba principal ou aplicativo separado de chat.
- Permitir SQL livre, tool calling genérico ou execução de código pelo modelo.
- Enviar WhatsApp/e-mail/Instagram, publicar conteúdo ou alterar dados do CRM.
- Conversa simultânea entre vários agentes ou conselho/roundtable no mesmo turno.
- Fine-tuning, treinamento de modelo ou RAG externo novo.
- Expor transcrições brutas, DNA completo ou prompt de sistema no navegador.
- Sincronização automática não revisada de qualquer agente existente no AIOS.
- Dar acesso ao chat para clientes externos ou usuários sem sessão administrativa.

## Dev Notes

- `src/app/agentes/page.tsx` é server component e hoje só renderiza o catálogo.
  Preservar carregamento server-side dos metadados; isolar o chat interativo em
  componente client sem enviar prompts privados.
- `content/agentes.json` contém seis perfis conceituais. Evoluir/migrar com
  compatibilidade explícita; não manter dois catálogos divergentes.
- `src/app/api/ai/route.ts` já centraliza IA, provider e ações do Sales Copilot.
  Avaliar extração de serviço/rota própria para conversa para não aumentar o
  switch existente até ficar inseguro ou impossível de testar.
- `src/lib/salesCopilot.mjs` já possui minimização, redação, evidência e contrato
  que proíbe ações arbitrárias. Reutilizar os princípios e funções aplicáveis.
- `src/lib/salesCopilotService.mjs` já implementa timeout, retry e falha parcial.
- Rotas atuais em `src/app/api/` e conteúdos sincronizados são fontes candidatas;
  o broker deve chamar serviços compartilhados ou repositórios server-side, não
  fazer HTTP interno desnecessário nem duplicar cálculo.
- O projeto usa OpenRouter/cascata já configurada. Não introduzir novo provider,
  SDK ou credencial nesta story sem decisão arquitetural separada.
- O checkout AIOS é fonte de geração, não dependência em runtime. Caminhos locais
  absolutos nunca entram no código executado na Vercel.
- O repositório possui alterações locais não relacionadas; preservar e excluir
  do File List desta story.

### Arquivos previstos

**Novos**

- `scripts/migrations/20260820_ai_agent_conversations.sql`
- `scripts/sync-aios-agent-dna.mjs`
- `scripts/check-ai-agent-dna.mjs`
- `content/ai-agents/manifest.json`
- `src/server/aiAgentPersonas.generated.mjs`
- `src/lib/aiAgentRegistry.ts`
- `src/lib/aiContextBroker.ts`
- `src/lib/aiConversation.ts`
- `src/app/api/ai/conversations/route.ts`
- `src/app/api/ai/chat/route.ts`
- `src/app/agentes/AgentChatWorkspace.tsx`
- `src/app/agentes/AgentPicker.tsx`
- `tests/ai-agent-registry.test.ts`
- `tests/ai-context-broker.test.ts`
- `tests/ai-conversations.test.ts`
- `tests/ai-agents-ui.test.ts`

**Modificados**

- `content/agentes.json`
- `scripts/supabase-schema.sql`
- `src/app/agentes/page.tsx`
- `src/app/api/ai/route.ts` ou serviço compartilhado extraído
- `src/lib/aiComplete.ts`
- `src/app/globals.css`
- `package.json`

### Testing

- Unitário: registro, aliases, hash/versionamento, extrator de DNA, composição de
  prompt, truncamento, citações, minimização e parser de `@atalho`.
- Contrato: cada agente responde com o mesmo fato/número e lente distinta; prompt
  não contém comandos, ferramentas, secrets ou autoridade importada.
- API: sessão, ownership, paginação, escopos, deal inválido, persistência,
  cancelamento, timeout e provider/fonte indisponível.
- Segurança: prompt injection em toda fonte textual, tentativa de tool call,
  exfiltração de prompt/secret, enumeração de conversa e escrita no CRM.
- Integração: perguntas reais sobre deal, funil, relatório e integração com
  citações e horários de corte verificáveis.
- Visual: catálogo + chat, picker por teclado, histórico longo, citações, erro,
  streaming/loading e mobile.

## Rollout e rollback

- Validar snapshots/hashes e migration com `ROLLBACK` antes do banco real.
- Disponibilizar sob flag server-side `AI_AGENTS_CHAT_ENABLED`; com a flag
  desligada, `/agentes` continua exibindo o catálogo atual.
- Liberar primeiro em sessão administrativa, executar smoke somente leitura com
  um prompt por agente e comparar fatos/citações.
- Monitorar latência, falha, tokens e custo sem registrar conteúdo sensível.
- Em rollback, desligar a flag e reverter o deploy; preservar conversas/tabelas
  até decisão explícita de retenção ou exclusão.

## CodeRabbit Integration

- Tipo: AI + Full-stack + Data + Security + Prompt supply chain; complexidade alta.
- Pre-Commit `@dev`: allowlist, prompt composition, citações, limites, auth,
  persistência, injeção e testes negativos de escrita.
- Pre-PR `@architect`/`@cyber-chief`: proveniência do DNA, isolamento server-side,
  minimização, tool-call denial, ownership e compatibilidade com Story 032.
- Pre-Deployment `@devops`: flag, provider existente, migrations, secrets,
  observabilidade, custo, rollback e smoke autenticado.
- Self-healing: `@dev` light, até 2 iterações/15 min, auto-fix somente CRITICAL;
  HIGH exige revisão humana de arquitetura/segurança.

## Story Draft Checklist

- Goal & Context Clarity: PASS
- Technical Implementation Guidance: PASS
- Reference Effectiveness: PASS
- Self-Containment Assessment: PASS
- Testing Guidance: PASS
- CodeRabbit Integration: PASS
- Readiness: READY FOR PO REVIEW

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-20 | 1.2 | Fallback de provider recuperado, contexto volumoso minimizado e retries consolidados visualmente | @dev |
| 2026-08-20 | 1.0 | Story criada para chat contextual com especialistas versionados na aba Agentes | @sm |
| 2026-08-20 | 1.1 | Chat, DNA versionado, broker somente leitura, persistência e interface implementados; migrations aplicadas | @dev |

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex (`@dev` / Dex)

### Debug Log References

- `node --test tests/ai-agent-registry.test.ts tests/ai-conversations.test.ts tests/ai-context-broker.test.ts tests/ai-conversation-routes.test.ts tests/ai-agents-ui.test.ts` - 15/15 PASS.
- `npm run lint` - PASS.
- `npm run typecheck` - PASS.
- `npm test` - 210/210 PASS.
- `npm run build` - PASS, incluindo `ai:dna:check`.
- Smoke autenticado real do chat - HTTP 200, Groq `qwen/qwen3.6-27b`, resposta persistida com 5 citacoes.
- Migration `20260820_ai_agent_conversations.sql` validada com ROLLBACK e aplicada via Management API, HTTP 201.
- CodeRabbit CLI indisponível no Windows e WSL sem distribuição instalada; revisão automatizada externa não executada.

### Completion Notes List

- Catálogo único com sete especialistas, snapshots públicos e DNA server-side sincronizados por allowlist e hash.
- Chat autenticado e somente leitura com histórico, ownership, escopos, menções, citações, cancelamento, retry e falha parcial.
- Broker reutiliza forecast e perdas determinísticos, pagina deals, minimiza texto e nunca aceita tabela, SQL ou ferramenta vindos da pergunta.
- Flag `AI_AGENTS_CHAT_ENABLED` preserva o catálogo quando o chat está desligado.
- Fallback atualizado para Groq/Qwen apos OpenRouter rejeitar a credencial e o modelo Groq legado deixar de estar disponivel.
- Forecast bruto de aproximadamente 1,2 MB deixa de enviar a lista integral de deals; o modelo recebe agregados, amostra limitada e limitacoes explicitas.
- Tentativas repetidas permanecem no banco para auditoria, mas a interface exibe apenas a pergunta original e a resposta completa mais recente.
- Localhost iniciado em `http://localhost:3000/agentes` com a flag habilitada.

### File List

- `content/agentes.json`
- `content/ai-agents/manifest.json`
- `docs/stories/story-035-chat-contextual-multiagente-crm.md`
- `package.json`
- `scripts/check-ai-agent-dna.mjs`
- `scripts/migrations/20260820_ai_agent_conversations.sql`
- `scripts/supabase-schema.sql`
- `scripts/sync-aios-agent-dna.mjs`
- `src/app/agentes/AgentChatWorkspace.tsx`
- `src/app/agentes/AgentPicker.tsx`
- `src/app/agentes/page.tsx`
- `src/app/api/ai/chat/route.ts`
- `src/app/api/ai/conversations/route.ts`
- `src/app/globals.css`
- `src/lib/aiAgentRegistry.generated.ts`
- `src/lib/aiAgentRegistry.ts`
- `src/lib/aiChatAuth.ts`
- `src/lib/aiContextBroker.ts`
- `src/lib/aiConversation.ts`
- `src/lib/aiMessageHistory.ts`
- `src/lib/aiProviders.mjs`
- `src/server/aiAgentPersonas.generated.d.mts`
- `src/server/aiAgentPersonas.generated.mjs`
- `tests/ai-agent-registry.test.ts`
- `tests/ai-agents-ui.test.ts`
- `tests/ai-context-broker.test.ts`
- `tests/ai-conversation-routes.test.ts`
- `tests/ai-conversations.test.ts`
- `tests/ai-providers.test.ts`

## QA Results
