# Story 037 - Demandas em Overview com pastas e listas

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@ux-design-expert`, `@data-engineer`

## Story

Como operador do CRM, quero organizar as demandas em Espaço > Pasta de cliente >
Lista e ver o Overview do que vence na janela escolhida, para bater o olho no que
está atrasado e no que entra nos próximos dias sem rolar a lista inteira.

## Contexto

A aba entregue na Story 034 é uma lista plana: cinco grupos fixos por prazo
(Atrasadas / Hoje / Próximas / Sem prazo / Concluídas), uma toolbar de `select` e
linhas-botão. Toda demanda de todo cliente cai na mesma lista e o único recorte é
por filtro — não existe hierarquia de organização.

A referência visual trazida em 21/08/2026 (BROUD OS) organiza a mesma operação em
três níveis numa coluna de árvore e usa um "Overview" com janela temporal, grupos
colapsáveis por dia e cada grupo em formato de tabela. A referência é de interação
e arquitetura da informação: a implementação preserva o design system claro/violeta
do Hub e não copia marca, cores ou componentes da referência.

## Revisão de 21/08/2026 (após uso real)

A primeira entrega usou hierarquia fixa de três níveis (Espaço > Pasta > Lista) e
`window.prompt`. Ao usar, o modelo não bateu: o operador quer **o cliente como pasta
de topo** e subpastas livres dentro dela ("BFT > Social Media", "BFT > Mídia Paga"),
e quer **arrastar** demandas e pastas em vez de abrir cada uma.

Trocado por uma árvore única auto-referenciada (`demand_folders.parent_id`), com
profundidade livre e demanda podendo morar em qualquer nível. Migration
`20260822_demand_folder_tree.sql` derruba as três tabelas antigas — com um
`raise exception` que aborta se alguma demanda estiver arquivada nelas.

## Decisões aprovadas

- Hierarquia real no banco: árvore única `demand_folders(parent_id, deal_id)`.
  Pasta raiz = cliente, com vínculo opcional a um deal ganho.
  `client_demands.folder_id` nulo = "Sem pasta".
- Status permanecem os cinco do banco (`todo`, `in_progress`, `review`, `done`,
  `cancelled`). Só os rótulos mudam: A iniciar / Criando / Em aprovação /
  Entregue / Cancelada. O `check` da tabela não é alterado.
- Só a visão Overview nesta story. `VIEWS` em `DemandOverview.tsx` fica pronto
  para Lista / Quadro / Calendário entrarem depois.
- Sem backfill: demanda existente fica com `list_id` nulo e aparece no nó virtual
  "Sem pasta", agrupada por cliente.
- Atribuição de lista acontece no formulário de criação e nas propriedades do
  `DemandWorkspace`. Arrastar-e-soltar fica fora do escopo.

## Dependências

- Reutiliza `deals`, a sessão administrativa (`requireDemandAdminSession`), o
  `DemandWorkspace` e o deep link `?demandId=` da Story 034.
- Reutiliza `public.set_client_demand_updated_at()` nos triggers das tabelas novas.

## Acceptance Criteria

- [x] AC1 - Migration aditiva cria as três tabelas, adiciona `list_id` com
      `on delete set null`, liga RLS sem policy pública e não apaga nada.
- [x] AC2 - A árvore mostra pastas aninhadas em profundidade livre, com contagem de
      demandas abertas somada da folha até a raiz, e busca por nome.
- [x] AC3 - Criar, renomear e excluir pasta funciona pela árvore, em modal da própria
      página (nada de `window.prompt`/`window.confirm`). Excluir leva as subpastas
      junto e devolve as demandas para "Sem pasta" em vez de removê-las.
- [x] AC11 - Arrastar demanda para uma pasta arquiva; arrastar para "Sem pasta"
      desarquiva. Arrastar pasta para outra reparenta; soltar na área vazia volta ao
      topo. Mover uma pasta para dentro da própria subárvore é recusado nos dois
      lados (a UI não aceita o drop; a API responde 400).
- [x] AC12 - Cada linha do Overview tem ação de excluir, e o grupo de um cliente em
      "Sem pasta" pode ser arrastado ou excluído inteiro de uma vez. A exclusão é
      definitiva (`DELETE /api/demands?hard=1&demandIds=`), remove os arquivos do
      bucket antes de apagar a linha e passa por confirmação no modal. O `DELETE`
      sem `hard=1` continua cancelando, como na Story 034.
- [x] AC13 - O miolo tem largura máxima de 1240px e fica centralizado; a coluna
      DEMANDA absorve a sobra e as outras cinco ficam justas à direita.
- [x] AC4 - Selecionar um nó recorta o Overview para as demandas dele; selecionar
      "Todas as demandas" volta ao conjunto completo.
- [x] AC5 - Overview tem janela 7 / 14 / 30 dias, bloco "Atrasadas" no topo,
      um grupo colapsável por dia em formato de tabela
      (DEMANDA | CLIENTE | RESP. | DATA | PRIORIDADE | STATUS), "Sem data de
      entrega" fechado por padrão e o rodapé "Mais N tarefa(s) com vencimento
      além de N dias".
- [x] AC6 - Barra de filtros com chips de responsável, chips de status,
      "Mostrar entregues" e busca de tarefa.
- [x] AC7 - Clicar na linha abre o `DemandWorkspace`, mantém `?demandId=` na URL
      e restaura o scroll ao fechar.
- [x] AC8 - Rótulos de status vivem só em `DEMAND_STATUS_LABELS`; página,
      overview e workspace consomem de lá.
- [x] AC9 - Abaixo de 768px a árvore deixa de ser sticky, a tabela rola dentro do
      próprio container e a página não rola na horizontal.
- [x] AC10 - `npm run lint`, `npm run typecheck` e `npm test` passam.

## Revisão 2 de 21/08/2026 (descoberta das ações)

Segundo uso real: as três operações já existiam, mas nenhuma era encontrável. O `+`
de subpasta e o `×` de excluir nasciam com `opacity: 0` e só apareciam no hover; a
seta de expandir só era renderizada quando a pasta já tinha filho (e como criar
subpasta estava escondido, ela nunca aparecia); renomear existia só como duplo
clique no nome. Trocado por um menu `⋯` sempre visível na linha, chevron permanente
em pasta e atalho de nova pasta também no cabeçalho.

- [x] AC14 - Toda pasta tem menu `⋯` sempre visível na linha, com Nova subpasta,
      Renomear e Excluir. O menu fecha no Esc, no clique fora e ao rolar a árvore,
      e sobe quando não há espaço abaixo. O duplo clique no nome segue como atalho
      de renomear.
- [x] AC15 - Pasta mostra o chevron mesmo sem subpasta (apagado); criar subpasta em
      pasta recolhida expande a pasta para a nova aparecer.
- [x] AC16 - Nova pasta de cliente pode ser criada pelo `+` do cabeçalho e pelo
      botão do rodapé da árvore.
- [x] AC17 - O nível da subpasta se lê na tela: recuo e linha-guia saem do `<ul>`
      aninhado (não de `paddingLeft` calculado por linha), o modal diz em que pasta
      a subpasta vai entrar, e criar/mover pasta avisa onde ela caiu.

## Revisão 3 de 21/08/2026 (o bug de verdade: duplo mapeamento)

O relato "a subpasta não fica dentro, sobe pro topo" era **bug real**, não percepção.
`GET /api/demand-folders` já devolve `DemandFolder` mapeado (a rota roda
`mapDemandFolder` no servidor), e `fetchFolders` em `page.tsx` mapeava **de novo** por
cima. O mapper lê `parent_id`/`deal_id` em snake_case; no corpo camelCase esses campos
não existem, então **toda pasta voltava com `parentId: null`** e a árvore inteira
desabava para a raiz — ordenada por `position`, o que fazia a pasta nova "subir".
O banco sempre esteve certo; o arrastar também gravava certo e o refetch desfazia na tela.

Diagnosticado abrindo a tela real no Playwright com um cookie de sessão assinado
localmente (`createAdminSession` + `CRM_AUTH_SECRET`) e medindo a profundidade de cada
linha no DOM: todas em `depth 0`. As duas rodadas anteriores tinham sido diagnosticadas
por dedução, e a dedução errou.

- [x] AC18 - `fetchFolders` consome o corpo da rota direto, sem remapear, e
      `mapDemandFolder` virou idempotente (aceita snake_case e camelCase). Teste trava os
      dois lados.
- [x] AC19 - A hierarquia se lê na árvore: ícone de pasta por linha, linha-guia vertical
      com cotovelo por nível e recuo de 24px, no lugar do `paddingLeft` calculado.
- [x] AC20 - `⋯ → Mover para...` move a pasta por lista de destinos escritos por extenso
      ("BFT / Social Media"), recusando a própria subárvore via `isDescendantFolder`.
      O arrastar continua, agora pegando também pelo botão do nome.
- [x] AC21 - A pasta recém-criada já nasce selecionada, com o caminho completo no
      breadcrumb do painel da direita.
- [x] AC22 - O menu `⋯` aparece inteiro em qualquer linha, inclusive na última da lista.
      Painel `position: fixed` medido pela viewport: como absoluto, ele era recortado pelo
      `overflow-y` da árvore ao abrir para cima e engolia "Nova subpasta" e "Renomear".
      Verificado no browser com `elementFromPoint` nos quatro itens, na primeira e na
      última pasta.

## File List

- `scripts/migrations/20260821_demand_folders.sql` (v1, superada)
- `scripts/migrations/20260822_demand_folder_tree.sql` (árvore única)
- `scripts/supabase-schema.sql` (bloco Story 037)
- `src/lib/demandFolders.ts` (árvore, `isDescendantFolder`, `folderSubtreeIds`)
- `src/lib/clientDemands.ts` (labels, `folderId`, `buildDemandOverview`)
- `src/lib/demandServer.ts` (`DEMAND_FOLDER_SELECT`, `assertDemandFolderExists`)
- `src/app/api/demand-folders/route.ts` (CRUD de pasta + trava de ciclo no PATCH)
- `src/app/api/demands/route.ts` (`folderId` em GET/POST/PATCH)
- `src/app/demandas/page.tsx` (reescrita)
- `src/components/DemandTree.tsx` (árvore + arrastar)
- `src/components/DemandOverview.tsx` (linhas arrastáveis)
- `src/components/DemandDialog.tsx` (modal `<dialog>` de criar/renomear/excluir)
- `src/components/DemandWorkspace.tsx` (select de pasta, labels do domínio)
- `src/app/globals.css` (árvore, abas, filtros, tabela, modal, estados de arrasto)
- `tests/demand-folders.test.ts`, `tests/demands-ui.test.ts`
- `package.json` (registro do teste novo)

## Notas de execução

- `npm run lint`, `npm run typecheck` e `npm test` (240 testes) verdes.
- Smoke da exclusão definitiva com demandas descartáveis: mover 3 em lote para uma
  pasta, apagar 2 de uma vez e a última sozinha, e confirmar que as 4 demandas
  reais continuaram intactas.
- Migrations validadas com ROLLBACK antes de aplicar; após a `20260822`, conferido
  no banco: tabelas antigas zeradas, `parent_id` e `folder_id` criados, nenhum
  `list_id` residual, 4 demandas intactas em "Sem pasta".
- Smoke pela API real: aninhamento de 3 níveis, mover demanda, mover subpasta entre
  raízes, ciclo e auto-pai recusados com HTTP 400, delete em cascata devolvendo a
  demanda para "Sem pasta".
- `src/lib/demandFolders.ts` importa `./clientDemands.ts` com extensão relativa:
  `node --test` não resolve o alias `@/` em import de valor, e o tsconfig já liga
  `allowImportingTsExtensions`.
- `DemandDialog` reinicia os campos durante a renderização (padrão de estado
  derivado do React) em vez de dentro do `useEffect` — a regra
  `react-hooks/set-state-in-effect` do ESLint barra a segunda forma.
