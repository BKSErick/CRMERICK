# Story 060 — Operação governante ponta a ponta

## Status

Done

## Story

Como operador da prospecção, quero que a régua governante esteja presente desde a
captação até a Sala de Comando, para que nenhum lead sem ICP ou capacidade volte à fila
por uma rota lateral e para que as respostas preservem a posição de governante para
governante.

## Estratégia dos clones

- **Willian Celso:** a interface, os textos e o encaminhamento ao decisor devem carregar
  a mesma densidade simbólica da estratégia, sem pedidos de licença ou linguagem de
  prestador esperando aprovação.
- **Thiago Finch:** captação, classificação e ordenação devem proteger a economia da
  operação. Volume só entra depois dos gates; score e sinais apenas ordenam elegíveis.

## Acceptance Criteria

- [x] 1. Novos leads recebem os cinco campos de elegibilidade no momento da gravação.
- [x] 2. A busca padrão deixa de puxar categorias anti-ICP e privilegia termos industriais
      com evidência de operação e capacidade.
- [x] 3. A fila automática ordena apenas elegíveis por sinal, capacidade e score.
- [x] 4. Filas explícitas preservam rigorosamente a ordem dos IDs aprovados, inclusive a
      fila congelada de 25/09.
- [x] 5. A Sala de Comando aplica a mesma régua e exibe capacidade, trilha, acesso ao
      decisor e motivo da elegibilidade.
- [x] 6. Mensagens de gatekeeper e decisor indicado vivem no playbook versionado e não
      pedem permissão para avançar.
- [x] 7. Nenhuma mensagem é enviada durante implementação ou validação.
- [x] 8. Testes, lint, typecheck e build passam; hashes da fila de 25/09 permanecem iguais.

## Validação final

- Suite: 574 testes aprovados.
- Typecheck e build aprovados.
- Lint sem erros; permanecem 2 warnings preexistentes em `SessionWatcher.tsx` e `Sidebar.tsx`.
- Dry-run ao vivo: 3/3 leads da manhã e 14/14 da tarde, na ordem literal dos manifestos.
- Nenhuma mensagem enviada; os dry-runs não usaram `--go`.

| Arquivo congelado | SHA-256 |
|---|---|
| `2026-09-25-morning.manifest.json` | `DBD0CF627D4CBA435458BDB945D87629DF85C52509CE14A49E35148762D371EC` |
| `2026-09-25-morning.approval.json` | `98E78AE42DA7D689810F3B38E25EF29D258EFC2BBC202B62606D0C0E3F2B5D90` |
| `2026-09-25-afternoon.manifest.json` | `E3055886C06D6D19D07E9470DCE496BAE01C3EC2CC39250D49B70FC9EB46CEE3` |
| `2026-09-25-afternoon.approval.json` | `E97E24B75FFDC34E38306769B0B7D645162139CA5B542A8F692A7D9649FB3AAE` |

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### File List

- `docs/stories/story-060-operacao-governante-ponta-a-ponta.md`
- `content/sales-playbook.json`
- `scripts/lib/leadIngest.js`
- `scripts/pull-city-serper.mjs`
- `scripts/uazapi-followup-batch.mjs`
- `scripts/uazapi-send-batch.mjs`
- `src/app/api/comando/route.ts`
- `src/app/comando/page.tsx`
- `src/lib/followup.ts`
- `src/lib/prospectingEligibility.d.ts`
- `src/lib/prospectingEligibility.mjs`
- `src/lib/salesPlaybook.mjs`
- `tests/lead-icp-score.test.ts`
- `tests/prospecting-eligibility.test.ts`
- `tests/prospecting-search.test.ts`
- `tests/sales-automation.test.ts`

## Change Log

- 2026-09-24: Régua concluída nas rotas de entrada, busca, ordenação, cockpit e respostas.
