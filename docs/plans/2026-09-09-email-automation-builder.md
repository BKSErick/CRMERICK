# Plano de implementacao - Editor visual seguro de automacoes

**Design:** `docs/plans/2026-09-09-email-automation-builder-design.md`
**Story:** `docs/stories/story-047-email-automation-builder.md`

### Tarefa 1: Fixar contratos em testes RED

**Arquivos:** `tests/email-automation-graph.test.ts`,
`tests/email-automation-schema.test.ts`, `tests/email-automation-routes.test.ts`,
`tests/email-automation-ui.test.ts`, `package.json`

**Objetivo:** Definir catalogo, validacao, simulacao, persistencia, APIs e guardas de
UI antes do codigo de producao.

**Verificacao:** Os testes devem falhar inicialmente pela ausencia dos modulos e
rotas, e nunca devem acessar rede.

### Tarefa 2: Implementar validador e simulador puro

**Arquivos:** `src/lib/emailAutomationGraph.ts`

**Objetivo:** Validar tipos, configuracao, gatilho unico, integridade das arestas,
alcance e ciclos; simular o fluxo em ordem deterministica.

**Verificacao:** Testes cobrem grafo valido, tipos bloqueados, ciclos, orfaos,
configuracoes invalidas e trilha previsivel.

### Tarefa 3: Criar schema e repositorio

**Arquivos:** `scripts/migrations/20260909_email_automation_builder.sql`,
`scripts/migrations/20260909_email_automation_builder.rollback.sql`,
`scripts/supabase-schema.sql`, `src/lib/emailAutomationRepository.ts`

**Objetivo:** Persistir rascunhos, revisoes e testes com RLS deny-by-default,
arquivamento reversivel e controle otimista de versao.

**Verificacao:** Testes estaticos confirmam constraints, indices, RLS, triggers e
paridade com o schema de referencia.

### Tarefa 4: Criar APIs autenticadas

**Arquivos:** `src/app/api/email-automations/route.ts`,
`src/app/api/email-automations/[id]/route.ts`,
`src/app/api/email-automations/test/route.ts`

**Objetivo:** Listar, criar, consultar, versionar, arquivar e simular. Nao criar
endpoint de ativacao, execucao ou envio.

**Verificacao:** Testes de rota cobrem autenticacao, validacao, conflito de versao,
arquivamento e simulacao sem efeitos externos.

### Tarefa 5: Implementar lista e editor

**Arquivos:** `src/app/automacoes/page.tsx`, componentes em
`src/components/email-automations/`, `src/lib/navigation.ts`,
`src/components/Sidebar.tsx`, `src/app/globals.css`

**Objetivo:** Entregar lista e editor visual com React Flow, paleta, custom nodes,
inspetor, controles, minimapa, save e painel de teste.

**Verificacao:** Testes estruturais, typecheck e smoke visual desktop/mobile.

### Tarefa 6: Gates e rollout isolado

**Arquivos:** story, scripts de verificacao e staging isolado de deploy.

**Objetivo:** Executar suite focada, lint, typecheck e build; criar snapshot remoto,
dry-run da migration, aplicar, verificar RLS, publicar somente arquivos da story e
executar smoke autenticado/nao autenticado.

**Verificacao:**

```powershell
npm.cmd run test:email-automations
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git -c safe.directory='D:/001Gravity/CRM ERICK' diff --check
```

Nenhum teste, migration ou deploy autoriza envio automatico de e-mail.
