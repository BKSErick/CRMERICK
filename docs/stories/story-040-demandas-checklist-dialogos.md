# Story 040 - Checklist limpo e dialogos centralizados em Demandas

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`

## Story

Como operador de Demandas, quero um checklist compacto e dialogos centralizados,
para editar tarefas e confirmar acoes sem controles quebrados ou janelas fora do
foco visual.

## Contexto

O grid atual recebe cinco filhos em tres colunas e cria uma segunda linha
implicita, fazendo o `x` de exclusao ocupar quase toda a largura. O dialogo
compartilhado depende do posicionamento do navegador e as exclusoes internas
ainda usam `window.confirm`.

## Acceptance Criteria

- [x] AC1 - Cada item do checklist apresenta checkbox, titulo e um unico grupo
      de acoes na mesma linha em desktop.
- [x] AC2 - Subir, descer e excluir usam botoes compactos com SVG, estados
      disabled e nomes acessiveis.
- [x] AC3 - A exclusao usa lixeira discreta; o `x` esticado deixa de existir.
- [x] AC4 - Item concluido fica visualmente suavizado e riscado, sem mudar a
      persistencia ou impedir reabertura.
- [x] AC5 - A barra representa a porcentagem real ja calculada pelo dominio.
- [x] AC6 - Em viewport estreita, titulo permanece legivel e acoes nao deformam
      a linha.
- [x] AC7 - Todos os estados de `DemandDialog` abrem centralizados na viewport,
      com altura maxima e rolagem interna.
- [x] AC8 - Exclusoes de checklist, link e anexo usam o `DemandDialog`
      compartilhado; nao resta `window.confirm` em DemandWorkspace.
- [x] AC9 - Esc, foco preso, backdrop, cancelar e confirmacao continuam
      funcionando pelo `<dialog>` nativo.
- [x] AC10 - Nao existe mudanca em API, banco, dependencias ou regras de negocio.
- [x] AC11 - Testes de regressao e todos os gates locais passam.

## Tasks / Subtasks

- [x] Criar teste RED do layout e dos dialogos.
- [x] Agrupar e estilizar as acoes do checklist.
- [x] Substituir confirmacoes nativas pelo dialogo compartilhado.
- [x] Centralizar o dialogo e fechar comportamento responsivo.
- [x] Executar gates e atualizar checklist, notas e File List.

## Testing

- `node --test tests/demands-ui.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED: `node --test tests/demands-ui.test.ts` manteve os 13 contratos antigos
  verdes e falhou nos 2 novos contratos de checklist e dialogo.
- GREEN: o mesmo teste fechou em 15/15 depois do agrupamento das acoes, do
  breakpoint responsivo e da centralizacao compartilhada.
- Regressao completa: 280/280 testes verdes.

### Completion Notes List

- Corrigida a causa raiz: os cinco filhos do item deixaram de disputar um grid
  de tres colunas; as tres acoes agora formam um unico grupo compacto.
- O `x` textual foi substituido por controles SVG de 30 px, com estados
  acessiveis, foco, hover, perigo e disabled.
- Conclusao aplica atenuacao e risco no titulo; a porcentagem existente agora
  alimenta uma barra visual real.
- `DemandDialog` passou a ter centralizacao explicita na viewport, limite de
  altura e rolagem interna. Checklist, links e anexos usam sua confirmacao.
- Nenhuma API, migration, dependencia ou regra de persistencia foi alterada.
- Gates: lint, typecheck, 280 testes, build de producao e `git diff --check`
  passaram.

### File List

- `docs/plans/2026-08-25-demandas-checklist-dialog-design.md`
- `docs/plans/2026-08-25-demandas-checklist-dialog-implementation.md`
- `docs/stories/story-040-demandas-checklist-dialogos.md`
- `src/app/globals.css`
- `src/components/DemandWorkspace.tsx`
- `tests/demands-ui.test.ts`

## Change Log

- 2026-08-25: Design aprovado e story criada para implementacao TDD.
- 2026-08-25: Checklist, dialogos e responsividade implementados e validados.
