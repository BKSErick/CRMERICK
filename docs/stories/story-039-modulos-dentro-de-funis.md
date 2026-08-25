# Story 039 - Modulos operacionais dentro de Funis

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`

## Story

Como operador do CRM, quero acessar Analises, Sinais, Achados e Lab como
subabas de Funis, para concentrar a leitura, os sinais e os experimentos do
ciclo comercial sem poluir a navegacao lateral.

## Contexto

O topo de `/funil` possui quatro botoes decorativos que nao navegam. Ao mesmo
tempo, os quatro modulos relacionados aparecem como destinos independentes na
Sidebar. O design aprovado adiciona `Visao geral` para preservar o painel atual
e reaproveita as rotas existentes como subabas reais.

## Acceptance Criteria

- [x] AC1 - A subnavegacao exibe, nesta ordem: `Visao geral`, `Analises`,
      `Sinais`, `Achados` e `Lab`.
- [x] AC2 - Cada aba abre sua rota existente: `/funil`, `/analise`, `/sinais`,
      `/insights` e `/lab`, sem duplicar o conteudo dos modulos.
- [x] AC3 - A aba correspondente a rota atual possui estado visual ativo e
      `aria-current="page"`.
- [x] AC4 - `Analise`, `Sinais`, `Achados` e `Lab` deixam de ser exibidos na
      Sidebar, mas suas rotas e titulos continuam validos para acesso direto.
- [x] AC5 - `Funis` permanece ativo na Sidebar quando qualquer uma das cinco
      rotas estiver aberta.
- [x] AC6 - A Visao geral preserva o painel e os filtros de fonte atuais.
- [x] AC7 - Os botoes decorativos `Winners na pratica`, `Fluxo 7 automacoes`,
      `Indicacao Landing` e `Reativacao sem culpa` deixam de existir no topo.
- [x] AC8 - A subnavegacao permanece utilizavel em viewport estreita e por
      teclado.
- [x] AC9 - Nao existe mudanca de API, dados, dependencia ou URL publica.
- [x] AC10 - Teste de regressao cobre o contrato e todos os gates locais passam.
- [x] AC11 - Sinais ignora, antes de qualquer contagem, eventos de `localhost`,
      loopback, rede privada, hosts `.local` e previews com caminho local do
      Windows, inclusive os dois caminhos `D:/tmp` informados pelo Erick.

## Tasks / Subtasks

- [x] Criar teste RED do contrato de navegacao.
- [x] Modelar filhos de Funis na fonte canonica de navegacao.
- [x] Criar `FunnelSubnav` e seus estilos.
- [x] Integrar o componente nas cinco rotas.
- [x] Ocultar os quatro filhos na Sidebar e preservar o estado pai.
- [x] Executar gates e atualizar checklist, notas e File List.
- [x] Excluir trafego local/de teste da leitura e da entrada de novos eventos.

## Testing

- `node --test tests/funnel-navigation.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED: `node --test tests/funnel-navigation.test.ts` falhou em 5/5 contratos
  porque o componente nao existia, os filhos ainda estavam visiveis na Sidebar
  e os botoes decorativos permaneciam em `/funil`.
- GREEN: o mesmo comando passou em 5/5 casos depois da fonte hierarquica, do
  componente compartilhado e da integracao das cinco rotas.
- RED local: `tests/sinais-local-traffic.test.ts` falhou por ausencia de
  `isTestTrafficUrl`; GREEN em 5/5 casos depois do filtro central.

### Completion Notes List

- `FunnelSubnav` concentra os cinco destinos aprovados, deriva o estado ativo da
  URL e publica `aria-current="page"`.
- As rotas filhas continuam registradas para titulo e deep link, mas a Sidebar
  filtra apenas sua exibicao e destaca o pai `Funis`.
- O painel da Visao geral e seus cinco filtros de fonte foram preservados; nao
  houve mudanca de API, dados, dependencia ou URL.
- A leitura de Sinais filtra eventos de teste antes de montar empresas, paginas,
  linhas e totais. Novos eventos locais retornam `ignored_test_traffic` sem
  persistencia nem envio analitico. Registros historicos nao foram apagados do
  banco; apenas deixaram de participar de qualquer contagem exibida.
- Gates verdes: lint, typecheck, 273/273 testes, build de 68 paginas e
  `git diff --check`.
- CodeRabbit nao executado: WSL nao possui distribuicao instalada neste Windows.

### File List

- `docs/plans/2026-08-25-funil-subnavigation-design.md`
- `docs/plans/2026-08-25-funil-subnavigation-implementation.md`
- `docs/stories/story-039-modulos-dentro-de-funis.md`
- `package.json`
- `src/app/analise/page.tsx`
- `src/app/api/facebook-pixel/route.ts`
- `src/app/api/sinais/route.ts`
- `src/app/funil/page.tsx`
- `src/app/globals.css`
- `src/app/insights/page.tsx`
- `src/app/lab/page.tsx`
- `src/app/sinais/page.tsx`
- `src/components/FunnelSubnav.tsx`
- `src/components/Sidebar.tsx`
- `src/lib/navigation.ts`
- `src/lib/sinais.ts`
- `tests/funnel-navigation.test.ts`
- `tests/sinais-local-traffic.test.ts`

## Change Log

- 2026-08-25: Design aprovado e story criada para implementacao TDD.
- 2026-08-25: Implementacao concluida e story movida para Ready for Review.
- 2026-08-25: Trafego local/de preview removido das contagens de Sinais.
