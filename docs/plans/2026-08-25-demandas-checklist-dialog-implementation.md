# Plano de implementacao - Checklist e dialogos de Demandas

## Tarefa 1: Criar contrato RED

**Arquivos:** `tests/demands-ui.test.ts`

**Objetivo:** Provar que o checklist ainda possui botoes soltos, confirmacoes do
navegador e dialogo sem centralizacao explicita.

**Codigo:** Adicionar assercoes para grupo unico de acoes, SVGs acessiveis,
estado concluido, ausencia de `window.confirm`, reuso de `DemandDialog` e CSS de
centro/max-height/responsividade.

**Verificacao:** `node --test tests/demands-ui.test.ts` falha pelos marcadores
ausentes antes da implementacao.

## Tarefa 2: Corrigir a estrutura do checklist

**Arquivo:** `src/components/DemandWorkspace.tsx`

**Objetivo:** Garantir que cada item tenha exatamente tres celulas de grid.

**Codigo:** Criar icones SVG locais; aplicar classe `done`; envolver os tres
botoes em `demand-checklist-actions`; substituir `x` por lixeira.

**Verificacao:** O contrato encontra uma unica celula de acoes por linha e nao
encontra o caractere de exclusao antigo.

## Tarefa 3: Unificar confirmacoes

**Arquivos:** `src/components/DemandWorkspace.tsx`,
`src/components/DemandDialog.tsx`

**Objetivo:** Confirmar exclusoes dentro do sistema visual de Demandas.

**Codigo:** Manter estado local `DemandDialogState`, abrir confirmacao destrutiva
para checklist/link/anexo e renderizar o dialogo compartilhado ao lado do
workspace. Nenhuma API muda.

**Verificacao:** Busca nao encontra `window.confirm` nos componentes de Demandas.

## Tarefa 4: Aplicar UI limpa e centro de viewport

**Arquivo:** `src/app/globals.css`

**Objetivo:** Corrigir a geometria, hierarquia visual e responsividade.

**Codigo:** Centralizar `.demand-dialog[open]`; limitar altura e overflow;
estilizar barra, linha, checkbox, titulo e botoes compactos; adicionar breakpoint
para as acoes.

**Verificacao:** Teste focado passa e o CSS explicita tamanho dos botoes,
centralizacao e layout mobile.

## Tarefa 5: Fechar qualidade e story

**Arquivo:** `docs/stories/story-040-demandas-checklist-dialogos.md`

**Objetivo:** Registrar o ciclo TDD e validar ausencia de regressao.

**Codigo:** Atualizar ACs, tarefas, notas e File List somente depois dos gates.

**Verificacao:** `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` e `git diff --check` passam.
