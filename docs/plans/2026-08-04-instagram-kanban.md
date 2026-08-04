# Plano de implementacao - Kanban Instagram

## Tarefa 1 - Cobrir classificacao e estrutura em RED

**Arquivos:** `tests/prospecting-operations.test.ts`, `tests/instagram-prospecting-ui.test.ts`

**Objetivo:** exigir o mapeamento deterministico de status para colunas e a presenca
do board, painel lateral, busca, arquivados e rastreamento do card selecionado.

**Verificacao:** os testes direcionados falham antes da implementacao pelos simbolos
e textos ainda inexistentes.

## Tarefa 2 - Criar fonte unica para colunas

**Arquivo:** `src/lib/prospecting.ts`

**Objetivo:** exportar `instagramKanbanColumnForStatus`, mapeando `review/ready`,
`opened`, `contacted`, `replied` e `paused/opted_out` para as cinco secoes aprovadas.

**Verificacao:** teste unitario cobre todos os status e passa.

## Tarefa 3 - Refatorar a fila para board + painel

**Arquivo:** `src/app/instagram/InstagramFollowups.tsx`

**Objetivo:** substituir os cards completos por cards compactos agrupados, adicionar
busca, filtro de arquivados e painel persistente. Manter `selectedDealId` durante o
refresh e rolar o card selecionado para a coluna nova apos a acao `open`.

**Verificacao:** teste de contrato da UI passa; abrir perfil nao remove o contexto do
lead selecionado; nenhuma chamada de envio automatico e adicionada.

## Tarefa 4 - Aplicar o design responsivo

**Arquivo:** `src/styles/hub.css`

**Objetivo:** criar board horizontal, colunas, cards densos, painel sticky, estados de
selecao/destaque e comportamento responsivo sem alterar os outros modos da aba.

**Verificacao:** build passa e smoke visual captura a aba de follow-ups em desktop.

## Tarefa 5 - Fechar story e publicar

**Arquivos:** `docs/stories/story-024-instagram-kanban-operacional.md` e arquivos da
feature.

**Objetivo:** rodar lint, typecheck, testes, build, audit, revisar diff, publicar em
`main` e confirmar que `crmerick.vercel.app` aponta para o deployment do commit.

**Verificacao:** gates verdes, SHA remoto igual ao local e Vercel `READY` no alias.
