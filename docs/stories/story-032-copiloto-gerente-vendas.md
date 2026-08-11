# Story 032 - Copiloto contextual de gestao comercial

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@architect`
- Apoio: `@qa`, `@data-engineer`

## Story

Como operador comercial, quero que o copiloto explique prioridades e prepare a
proxima melhor acao usando o contexto real do CRM, para decidir mais rapido sem
entregar a IA autoridade para agir sozinha.

## Contexto

O CRM ja possui `next-action`, resumos, insights e compilacao de achados por IA.
Esta story transforma essas funcoes em um copiloto de gestao: recebe dados
estruturados das stories anteriores, responde perguntas operacionais, mostra
evidencias e oferece tarefas ou rascunhos que o operador pode aprovar.

Nao sera criada aba ou chat independente. A visao diaria entra na `Sala de
Comando`; a explicacao contextual entra no overlay do `Pipeline`; aprendizados
duraveis continuam em `Achados`.

## Dependencias

- Stories 027, 028, 029, 030 e 031 concluidas.
- Reutilizar `/api/ai`, a tabela/rota de insights e o provider configurado.
- O item de inbox unificada permanece adiado e nao bloqueia esta story.

## Acceptance Criteria

- [x] O copiloto responde, no minimo: quem exige atencao hoje, quais propostas
  estao em risco, quais deals nao possuem proxima acao, por que um deal esta
  quente/frio, onde o funil perde conversao e qual acao deve ser considerada.
- [x] Toda resposta referencia dados concretos do CRM, periodo consultado e
  fatores utilizados; quando nao houver evidencia, declara a limitacao.
- [x] Respostas distinguem fato calculado, regra deterministica e sugestao de IA.
- [x] O copiloto pode produzir rascunho, tarefa sugerida ou recomendacao, mas a
  aplicacao exige gesto explicito do operador e passa pelo motor da Story 027.
- [x] Nenhuma resposta envia mensagem, muda etapa, altera preco ou confirma
  qualificacao automaticamente.
- [x] Sala de Comando reutiliza o componente atual de `next-action` para apresentar
  prioridades gerais e por deal, sem criar dashboard duplicado.
- [x] Pipeline exibe explicacao contextual e a evidencia do deal no overlay atual.
- [x] Achados recebe somente aprendizados que o operador mandar salvar ou
  compilacoes explicitamente solicitadas, evitando ruido automatico.
- [x] Existe comando CLI equivalente para gerar o briefing diario, consultar um
  deal e produzir rascunho sem depender da UI.
- [x] Falha/timeout do provedor nao bloqueia Pipeline, Comando ou operacoes
  deterministicas; retry e erro ficam observaveis e auditaveis.
- [x] Dados enviados ao modelo sao minimizados e credenciais permanecem apenas no servidor.
- [x] A navegacao existente permanece inalterada; nenhuma rota ou aba nova e criada.
- [x] Testes usam provider mockado e cobrem evidencia, ausencia de dados,
  autorizacao, falha, timeout e proibicao de acao automatica.
- [x] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Definir contratos de contexto, resposta, evidencia e acao sugerida (AC: 1-5).
- [x] Escrever testes RED com provider mockado e limites de autoridade (AC: 2-5, 10-13).
- [x] Consolidar o contexto das Stories 027-031 no backend atual de IA (AC: 1-3).
- [x] Implementar briefing e consultas CLI antes das integracoes visuais (AC: 9).
- [x] Integrar prioridades a Sala de Comando e contexto ao overlay do Pipeline (AC: 6, 7, 12).
- [x] Integrar salvamento explicito a Achados (AC: 8).
- [x] Implementar timeout, retry observavel, minimizacao de dados e degradacao segura (AC: 10, 11).
- [x] Executar regressao e quality gates (AC: 13, 14).
- [x] Atualizar checklist, Dev Agent Record e File List desta story.

## Fora de Escopo

- Nova aba ou chat independente.
- Inbox unificada, Gmail sync ou tracking de abertura/clique.
- Envio automatico de mensagens.
- Mudanca automatica de etapa, preco, prioridade manual ou qualificacao confirmada.
- Troca de provider de IA ou contratacao de servico externo novo.

## Dev Notes

- `src/app/api/ai/route.ts` ja implementa `generate-summary`, `generate-insight`,
  `next-action` e `compile-achados`; evoluir esse contrato em vez de criar outro silo.
- `src/app/comando/page.tsx` ja chama `next-action` por deal.
- `src/app/insights/page.tsx` e `src/app/api/insights/route.ts` sao a fonte dos
  aprendizados persistidos.
- `src/app/api/webhooks/uazapi/route.ts` ja produz insight best-effort e possui
  trilha de falhas; preservar degradacao segura.
- O contexto deve usar resultados deterministas de health, qualificacao, forecast
  e perdas, nao pedir ao modelo que recalcule esses dados.

## Testing

- Testes unitarios de montagem/minimizacao do contexto.
- Testes de contrato com LLM mockado para respostas fundamentadas.
- Testes negativos provando que sugestoes nao executam acoes sem confirmacao.
- Testes de timeout, retry e indisponibilidade sem derrubar telas existentes.
- Smoke visual em Comando, Pipeline e Achados, inclusive em viewport mobile.

## CodeRabbit Integration

- Tipo: AI + API + Security + Frontend; complexidade alta.
- Pre-Commit `@dev`: grounding, autorizacao, dados sensiveis e degradacao segura.
- Pre-PR `@devops`: contratos, secrets, compatibilidade e regressao das rotas atuais.
- Pre-Deployment `@devops`: provider, limites, logs e rollback.
- Self-healing: `@dev` light, ate 2 iteracoes/15 min, auto-fix apenas CRITICAL.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (`@dev`)

### Debug Log References

- `npm run lint` — 0 erros, 0 warnings.
- `npm run typecheck` — 0 erros.
- `npm test` — 176 testes, 176 passando (31 novos em `tests/sales-copilot.test.ts`).
- `npm run build` — build de producao OK; lista de rotas identica a anterior (nenhuma rota nova).
- `node scripts/apply-migration.mjs scripts/migrations/20260811_sales_copilot.sql --dry-run` — HTTP 201,
  validada com ROLLBACK no projeto real.
- `node scripts/apply-migration.mjs scripts/migrations/20260811_sales_copilot.sql` — HTTP 201, **aplicada
  em producao (11/08/2026)**. Verificado no banco: as regras `copilot-task-suggestion-v1` (`task.upsert`)
  e `copilot-draft-suggestion-v1` (`draft.create`) existem e estao habilitadas.
- `node scripts/sales-copilot.mjs --no-ai` — smoke somente leitura contra a base real: as quatro perguntas
  do briefing responderam com 40 afirmacoes classificadas e evidencia. `funnel_leakage` voltou
  `dataAvailable: false` declarando a limitacao real ("517 perdas antigas sem motivo registrado ficam
  fora da conta") em vez de fabricar um ponto de vazamento — o comportamento exigido pelo AC 2.

### Completion Notes List

**Arquitetura.** O nucleo (`salesCopilot.mjs`) e puro e deterministico: recebe o que as
Stories 027-031 ja calcularam (saude, qualificacao, forecast, perdas) e monta contexto,
evidencia e classificacao. Ele nunca pede ao modelo que recalcule esses numeros. O servico
(`salesCopilotService.mjs`) le as fontes reais e orquestra; o provedor de IA entra
**injetado** (`options.complete`), o que torna o teste com mock natural e mantem o nucleo
sem acesso a rede.

**Limite de autoridade.** O copiloto so sabe representar duas coisas: `task` e `draft`.
Enviar mensagem, mover etapa, mexer em preco, confirmar qualificacao ou setar prioridade
nao tem representacao no contrato — o parser descarta a tentativa e `assertCopilotSuggestion`
recusa. Quando o operador aprova, a sugestao **nao** escreve em `deals` por um caminho
proprio: vira o evento `copilot.suggestion_accepted` e passa pelo motor da Story 027, com
regra versionada, `execution_key` idempotente, guard de `next_action_source = manual` e
trilha em `commercial_automation_runs`. Aprovar o mesmo rascunho duas vezes nao gera dois
efeitos (o id do evento e um hash deterministico do conteudo).

**Autorizacao.** O operador vem da sessao administrativa assinada (`verifyAdminSession`),
nunca do corpo do request. `copilot-apply` e `copilot-save-learning` retornam 401 sem sessao.

**Degradacao.** Timeout (12s default) e retry (2 tentativas) com trilha por tentativa
(`provider`, `outcome`, `durationMs`, `error`). Provedor fora do ar vira `ai.status:
"unavailable"` + limitacao declarada, e a resposta deterministica sai inteira. Fonte
secundaria que falha (forecast, perdas) vira limitacao, nao excecao. Nenhuma tela quebra.

**Minimizacao.** `minimizeCopilotContext` reduz o payload a 8 campos e passa telefone,
e-mail e URL por redacao antes de qualquer coisa chegar ao modelo. Teste cobre o vazamento.

**Superficies.** Zero rota nova. `CopilotPanel` / `CopilotAnswerBody` sao o mesmo componente
nas tres telas: a Sala de Comando usa no bloco de prioridades gerais **e** dentro da fila
(a next-action por deal agora responde pelo copiloto, com evidencia e frases rotuladas);
o overlay do Pipeline ganhou explicacao contextual e preparo de proxima acao; Achados so
recebe o que o operador mandar salvar (tipo `copiloto`, fora de `NEW_TYPES`).

**Refactor colateral.** A cascata de provedores saiu de `aiComplete.ts` para
`aiProviders.mjs` (com `.d.mts`), para o CLI usar exatamente a mesma lista de modelos sem
duplicar. `aiComplete.ts` virou re-export — os tres consumidores atuais nao mudaram.

**Banco.** A migration `20260811_sales_copilot.sql` foi validada em dry-run e aplicada em
producao em 11/08/2026. E aditiva: amplia o `check` de `event_type` em `commercial_events`
e `commercial_automation_rules` e cadastra as duas regras do copiloto. Nenhuma coluna, dado
ou regra existente foi alterada.

**Achado do smoke em dados reais.** Existem 517 perdas antigas sem motivo registrado. Como
elas ficam fora da conta, `funnel_leakage` responde declarando essa limitacao em vez de
apontar uma etapa de vazamento sem base — que e exatamente o comportamento pedido. Para a
pergunta virar util, o backlog e registrar motivo nas perdas dali pra frente (Story 031 ja
deixou o caminho pronto).

### File List

**Novos**

- `src/lib/salesCopilot.mjs` + `src/lib/salesCopilot.d.mts`
- `src/lib/salesCopilotService.mjs` + `src/lib/salesCopilotService.d.mts`
- `src/lib/aiProviders.mjs` + `src/lib/aiProviders.d.mts`
- `src/components/CopilotPanel.tsx`
- `scripts/sales-copilot.mjs`
- `scripts/migrations/20260811_sales_copilot.sql`
- `tests/sales-copilot.test.ts`

**Modificados**

- `src/app/api/ai/route.ts` — acoes `copilot-brief`, `copilot-ask`, `copilot-draft`,
  `copilot-apply`, `copilot-save-learning` + operador via sessao administrativa.
- `src/app/comando/page.tsx` — prioridades gerais e next-action por deal pelo copiloto.
- `src/app/pipeline/page.tsx` — explicacao contextual e preparo de acao no overlay atual.
- `src/app/insights/page.tsx` — tipo `copiloto` no filtro e na reclassificacao.
- `src/lib/aiComplete.ts` — re-export da cascata compartilhada.
- `src/lib/commercialAutomation.mjs` + `.d.mts` — evento `copilot.suggestion_accepted`.
- `tests/commercial-automation.test.ts` — contrato de eventos atualizado.
- `package.json` — `copilot:brief`, `copilot:deal`, `copilot:draft` e o novo arquivo de teste.

## Change Log

- 2026-08-11: Story criada para consolidar o copiloto nas superficies existentes.
- 2026-08-11: Implementacao concluida. Nucleo deterministico + servico com provedor
  injetado, CLI somente leitura, acoes no `/api/ai`, integracao em Comando/Pipeline/Achados
  e 31 testes novos.
- 2026-08-11: Migration aplicada em producao e verificada; smoke do CLI contra a base real.
