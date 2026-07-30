# Story 022 - Encaminhamento acionavel na fila

## Status

Ready for Review

## Story

Como operador comercial, quero que uma tarefa explicita de contatar o responsavel
permaneca em Encaminhamentos mesmo depois de agradecer ao contato original, para
que o proximo passo nao seja confundido com um follow-up comum.

## Acceptance Criteria

- [x] `contactar_responsavel` vencido aparece em Encaminhamentos.
- [x] Resposta de agradecimento ao contato original nao encerra essa tarefa.
- [x] Tarefa manual futura continua em Aguardando cadencia.
- [x] Interface e CLI passam o tipo da proxima acao ao classificador.
- [x] Testes, lint, typecheck e build passam.
- [ ] Publicacao e smoke de producao confirmados.

## File List

- `docs/stories/story-022-encaminhamento-acionavel.md`
- `src/lib/followup.ts`
- `src/app/disparo/page.tsx`
- `scripts/followup-ops.mjs`
- `tests/followup-operations.test.ts`

## Change Log

- 2026-07-30: Story criada a partir do caso real Vertical Eletrica -> Jean.
