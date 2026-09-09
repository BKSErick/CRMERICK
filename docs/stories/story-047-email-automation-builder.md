# Story 047 - Editor visual seguro de automacoes de e-mail

## Status

Deployed

## Story

Como operador comercial, quero criar automacoes em um editor visual dentro do CRM
Eric, para organizar gatilhos, regras e acoes, salvar versoes e testar o fluxo antes
de qualquer ativacao real.

## Dependencias

- Story 027 preservada como motor central de eventos e acoes seguras.
- Story 046 com caixa de e-mails e webhook em producao.
- Design aprovado em `docs/plans/2026-09-09-email-automation-builder-design.md`.

## Acceptance Criteria

- [x] Existe item `Automacoes` na navegacao e rota autenticada `/automacoes`.
- [x] A lista permite buscar, filtrar, criar e abrir automacoes.
- [x] O editor possui paleta, canvas conectado, zoom/pan, minimapa e inspetor.
- [x] Grafos persistem nodes, edges e viewport com historico imutavel de versoes.
- [x] O servidor exige exatamente um gatilho, rejeita ciclos, nodes orfaos e tipos
      ou configuracoes invalidas.
- [x] O teste produz trilha deterministica e persiste seu resultado sem efeitos externos.
- [x] Os estados permitidos sao apenas `draft`, `validated` e `archived`.
- [x] `Enviar e-mail` aparece bloqueado e nao pode ser adicionado ou executado.
- [x] Nao existe endpoint, worker ou controle para ativar/disparar automacoes.
- [x] Migration e schema sao aditivos, com RLS deny-by-default e rollback documentado.
- [x] Testes focados, lint, typecheck, build e validacao visual passam antes do rollout.
- [x] Migration e deploy de producao sao verificados separadamente do Git.

## Tasks / Subtasks

- [x] Definir arquitetura, catalogo V1 e limite de autoridade.
- [x] Escrever testes RED de grafo, schema, rotas e interface.
- [x] Implementar validador e simulador puro.
- [x] Criar migration, rollback e repositorio server-side.
- [x] Implementar APIs autenticadas sem rota de ativacao.
- [x] Implementar lista e editor visual responsivo.
- [x] Executar gates, smoke visual e atualizar File List.
- [x] Aplicar migration e deploy isolado com verificacao de producao.

## Fora de Escopo

- Envio automatico de e-mails.
- Resposta autonoma por IA.
- Agendamento, filas, workers e execucao em background.
- Importacao de automacoes existentes do Brevo.
- Edicao colaborativa em tempo real.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED inicial: os quatro arquivos focados falharam antes da implementacao.
- `npm.cmd run test:email-automations`: 21/21 testes passando.
- `npm.cmd run test:email-inbox`: 35/35 testes de regressao passando.
- `npm.cmd run lint`: passou sem erros; duas advertencias preexistentes de navegacao.
- `npm.cmd run typecheck`: passou.
- `npx.cmd next build --webpack`: Next 16.3.4 compilou 81 rotas.
- `npm.cmd audit --omit=dev --json`: 0 vulnerabilidades de producao.
- Suite completa: o unico bloqueio remanescente e o teste preexistente que ainda espera
  `Ficha de Escopo` em vez do posicionamento atual `Pedido Pronto`.
- Smoke autenticado do staging exato contra o Supabase de producao: 3 nodes, 2 edges,
  trilha de 3 passos, 0 efeitos externos, sem overflow desktop/mobile e envio bloqueado.
- Migration remota verificada com as tres tabelas, indices, trigger, RPCs atomicas, RLS
  deny-by-default e execucao anonima negada.
- Deploy de producao `dpl_6qiedrH5LLgyr3QV6pjQcZTPdbQU` ficou `READY` nos aliases
  `crm.mydrion.com.br` e `crmerick.vercel.app`.
- Smoke publico: `/automacoes` retorna 307 para login e `/api/email-automations`
  retorna 401 sem sessao.
- O smoke visual autenticado direto no alias nao foi repetido porque as credenciais de
  sessao da Vercel sao sensiveis e nao podem ser lidas; o staging publicado foi validado
  localmente com o mesmo Supabase e o mesmo pacote de arquivos.

### Completion Notes List

- Editor imersivo implementado com React Flow, paleta, conexoes, minimapa e inspetor.
- Lista e editor persistem rascunhos e revisoes imutaveis no Supabase.
- Simulacao e deterministica, somente leitura e registra trilha sem rede ou efeitos.
- Envio de e-mail permanece visivel como bloqueado; nao existe ativacao, fila ou worker.
- Migration foi aplicada em producao sem alterar a inbox da Story 046.
- Dependencias foram elevadas para Next 16.3.4, Sharp 0.35.4 e
  baseline-browser-mapping 2.11.0; o audit de producao ficou zerado.
- Publicacao foi feita por staging isolado; nenhum commit ou push Git foi executado.

### File List

- `docs/plans/2026-09-09-email-automation-builder-design.md`
- `docs/plans/2026-09-09-email-automation-builder.md`
- `docs/stories/story-047-email-automation-builder.md`
- `package.json`
- `scripts/migrations/20260909_email_automation_builder.sql`
- `scripts/migrations/20260909_email_automation_builder.rollback.sql`
- `scripts/supabase-schema.sql`
- `scripts/verify-20260909-email-automations.mjs`
- `scripts/smoke-email-automations-visual.mjs`
- `src/app/api/email-automations/route.ts`
- `src/app/api/email-automations/[id]/route.ts`
- `src/app/api/email-automations/test/route.ts`
- `src/app/automacoes/page.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/Sidebar.tsx`
- `src/components/email-automations/AutomationEditor.tsx`
- `src/components/email-automations/AutomationInspector.tsx`
- `src/components/email-automations/AutomationNode.tsx`
- `src/components/email-automations/AutomationPalette.tsx`
- `src/lib/emailAutomationGraph.ts`
- `src/lib/emailAutomationRepository.ts`
- `src/lib/navigation.ts`
- `tests/dependency-security.test.ts`
- `tests/email-automation-graph.test.ts`
- `tests/email-automation-routes.test.ts`
- `tests/email-automation-schema.test.ts`
- `tests/email-automation-ui.test.ts`

## Change Log

- 2026-09-09: Story criada com aprovacao dos itens 1 e 2 e fronteira sem envio.
- 2026-09-09: Editor, persistencia, simulacao e migration concluidos e validados.
- 2026-09-09: Migration e staging isolado publicados em producao.
- 2026-09-09: Next e dependencias vulneraveis atualizados; audit de producao zerado.
