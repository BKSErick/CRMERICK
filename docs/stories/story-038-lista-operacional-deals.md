# Story 038 - Lista operacional de deals

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`

## Story

Como operador do CRM, quero consultar os deals em uma lista densa e filtravel,
para localizar, comparar e abrir oportunidades sem percorrer todas as colunas do
Kanban.

## Contexto

O Pipeline e a fonte operacional dos deals, mas sua apresentacao em Kanban exige
rolagem horizontal e cria muitos cards quando a base cresce. A Lista e outra
projecao da mesma store e da mesma API, nao um segundo cadastro.

## Acceptance Criteria

- [x] AC1 - A navegacao exibe `Lista` logo depois de `Pipeline` e abre `/lista`.
- [x] AC2 - A rota carrega os mesmos deals de `/api/crm-data`, com estados visiveis
      de carregamento, erro e resultado vazio.
- [x] AC3 - A tabela exibe deal/empresa, etapa, responsavel, valor, saude, proxima
      acao e ultima atualizacao.
- [x] AC4 - Busca textual, etapa e responsavel sao filtros combinaveis.
- [x] AC5 - O operador ordena por proxima acao, atualizacao, valor, saude ou empresa,
      com desempate determinista.
- [x] AC6 - A tabela pagina 50 deals por vez, informa intervalo/total e impede pagina
      invalida quando os filtros mudam.
- [x] AC7 - Clicar numa linha ou abrir `?dealId=` usa o mesmo `DealDetailOverlay` do
      Pipeline; fechar o overlay limpa apenas o parametro do deal.
- [x] AC8 - Mudar etapa usa a store atual; entrar em `lost` exige motivo pelo mesmo
      `LossReasonDialog`; excluir reflete na Lista.
- [x] AC9 - Pipeline preserva o comportamento anterior depois da extracao do modal.
- [x] AC10 - Nao existe API, migration ou dependencia nova para esta entrega.
- [x] AC11 - Testes de dominio e contrato da UI cobrem a nova superficie e todos os
      gates locais passam.

## Tasks / Subtasks

- [x] Criar testes RED para filtro, ordenacao e paginacao.
- [x] Implementar `src/lib/dealList.ts` ate os testes ficarem verdes.
- [x] Criar teste RED do contrato da rota e navegacao.
- [x] Concluir a extracao compartilhada do overlay sem regressao do Pipeline.
- [x] Implementar `/lista`, estilos e deep link.
- [x] Registrar testes no `package.json` e executar a regressao completa.
- [x] Atualizar checklist, notas e File List apos os gates.

## Testing

- `node --test tests/deal-list.test.ts tests/deal-list-ui.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED 1: `tests/deal-list.test.ts` falhou com `ERR_MODULE_NOT_FOUND` antes da
  criacao do dominio; GREEN com 3/3 casos.
- RED 2: `tests/deal-list-ui.test.ts` falhou porque `/lista/page.tsx` nao existia;
  GREEN com 5/5 contratos depois da interface.
- A extracao do modal fez sete testes antigos procurarem seus marcadores no arquivo
  monolitico; as fontes de verificacao foram apontadas para o overlay/modulo
  compartilhado, sem relaxar as assercoes.

### Completion Notes List

- `/lista` usa os mesmos deals, store, mutacoes e modal do Pipeline, com filtros
  combinaveis, cinco ordenacoes e 50 linhas por pagina.
- `DealDetailOverlay`, vocabulario de etapas e rotulos operacionais foram extraidos
  sem duplicacao; os contratos antigos continuam cobertos.
- Gates verdes: lint, typecheck, 268/268 testes, build de 68 paginas com `/lista` e
  `git diff --check`; scan dos arquivos alterados nao encontrou segredo.
- Smoke anonimo em `localhost:3000/lista` confirmou o redirecionamento de protecao.
  O smoke autenticado nao prosseguiu porque a credencial historica foi recusada;
  nenhuma configuracao de autenticacao foi alterada.
- CodeRabbit nao executado: WSL nao possui distribuicao instalada neste Windows.
- DoD: todos os itens aplicaveis passaram; API/data model, dependencia, env e
  documentacao de usuario adicional sao N/A porque a entrega nao os altera.

### File List

- `docs/plans/2026-08-25-deals-lista-design.md`
- `docs/plans/2026-08-25-deals-lista-implementation.md`
- `docs/stories/story-038-lista-operacional-deals.md`
- `package.json`
- `src/app/globals.css`
- `src/app/lista/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/components/DealDetailOverlay.tsx`
- `src/components/Sidebar.tsx`
- `src/lib/dealList.ts`
- `src/lib/dealPresentation.ts`
- `src/lib/navigation.ts`
- `tests/commercial-automation.test.ts`
- `tests/deal-forecast.test.ts`
- `tests/deal-health.test.ts`
- `tests/deal-list-ui.test.ts`
- `tests/deal-list.test.ts`
- `tests/deal-loss-reasons.test.ts`
- `tests/deal-qualification.test.ts`
- `tests/pipeline-runtime.test.ts`
- `tests/sales-copilot.test.ts`

## Change Log

- 2026-08-25: Story criada a partir do design aprovado para `/lista`.
- 2026-08-25: Implementacao TDD concluida e story movida para Ready for Review.
