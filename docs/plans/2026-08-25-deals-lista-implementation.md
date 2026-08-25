# Plano de implementacao - Lista operacional de deals

## Tarefa 1 - Trancar o dominio da Lista com TDD

**Arquivos:** `tests/deal-list.test.ts`, `src/lib/dealList.ts`

**Objetivo:** definir tipos de filtro/ordenacao e provar busca combinada, ordem
determinista e paginacao de 50 itens.

**Verificacao:** `node --test tests/deal-list.test.ts` falha antes da implementacao
e passa depois do minimo codigo de dominio.

## Tarefa 2 - Trancar o contrato da interface

**Arquivo:** `tests/deal-list-ui.test.ts`

**Objetivo:** exigir rota `/lista`, entrada de navegacao, estados de tela, tabela,
deep link e reutilizacao de `DealDetailOverlay`/`LossReasonDialog`.

**Verificacao:** o teste falha sem a rota e passa apenas quando os contratos estao
presentes.

## Tarefa 3 - Consolidar o modal compartilhado

**Arquivos:** `src/app/pipeline/page.tsx`,
`src/components/DealDetailOverlay.tsx`, `src/lib/dealPresentation.ts`

**Objetivo:** concluir a extracao ja iniciada e manter o Pipeline funcional com os
mesmos componentes e regras.

**Verificacao:** typecheck, lint e testes existentes de Pipeline/perda.

## Tarefa 4 - Implementar `/lista`

**Arquivos:** `src/app/lista/page.tsx`, `src/app/globals.css`

**Objetivo:** carregar o CRM, aplicar filtros/ordenacao/paginacao, renderizar a
tabela responsiva e abrir o overlay compartilhado.

**Verificacao:** teste de UI, typecheck e smoke HTTP/visual local.

## Tarefa 5 - Publicar a entrada de navegacao

**Arquivos:** `src/lib/navigation.ts`, `src/components/Sidebar.tsx`

**Objetivo:** adicionar Lista imediatamente apos Pipeline com icone proprio e
titulo correto.

**Verificacao:** teste de UI e build contendo a rota `/lista`.

## Tarefa 6 - Fechar a story

**Arquivos:** `package.json`,
`docs/stories/story-038-lista-operacional-deals.md`

**Objetivo:** registrar os dois testes no gate padrao, executar a regressao e
atualizar checkboxes, notas e File List somente depois de tudo verde.

**Verificacao:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e
`git diff --check`.
