# Story 058 — ICP tipado e nota do lead

## Status

InProgress (regra e nota aplicadas; passe de IA dos indefinidos pendente)

## Story

Como operador do CRM, quero que todo lead tenha ICP definido e que o ICP pese na nota, para
que o topo da fila de prospecção seja de empresas que têm o problema que a Mydrion resolve.

## Contexto

Medido em 24/09/2026:

- 8.078 dos 9.284 prospects estavam com `is_icp` nulo. O `classify-icp` só olhava
  `segment_norm`, que estava vazio em 8.210 deals, e os imports não preenchiam ICP.
- O bônus de semelhança (`lookalikeBoost`) procurava o segmento como `industrial_b2b`, mas
  `data/winning-profile.json` usa a chave canônica (`usinagem`). A dimensão segmento nunca
  casava.
- A tela do deal cortava a nota em 10 (`Math.min(10, points)`), e os prompts de IA diziam
  "de 0 a 10". A nota real tem mediana de cerca de 57 e vai até cerca de 125.
- Os 15 indefinidos de maior nota (99 a 121) eram revenda agrícola, dentista e engenharia
  civil: fora do ICP e no topo da fila por porte e capital social.

## Acceptance Criteria

- [x] 1. A regra usa `segment_norm` ou, na falta dele, o segmento canônico de `segment`
      (`analise-comum.segmentoCanonico`). Com isso a regra decide cerca de 5.400 deals a mais.
- [x] 2. A regra só grava onde `icp_source` é nulo ou `regra`, ou sobre `ia` quando a regra
      decide. Manual e importação não são sobrescritos. Estágio avançado nunca vira "não".
- [x] 3. Casa de evento fica fora do ICP industrial (nulo).
- [x] 4. `--ia`: indefinidos (sem evento, sem perdidos), maior nota primeiro, com a decisão
      tipada. O critério é o ICP Ideal / Anti-ICP do `content/brandbook.json`, lido na
      execução. `incerto` também marca `icp_source='ia'`, pra não pagar a pergunta de novo.
- [x] 5. O ICP entra na nota: +15 dentro, -25 fora, 0 indefinido. A parcela fica em
      `deals.icp_points`, de forma idempotente e reversível
      (`points - icp_points` = nota base). Nunca abaixo de zero.
- [x] 6. Lead novo já entra com ICP pela regra e com a parcela na nota
      (`leadIngest.gravar`).
- [x] 7. O bônus de semelhança usa a chave canônica (`lead.segment_canonico`).
- [x] 8. A tela e os prompts mostram a nota real. O roteador aceita nota até 200.
- [x] 9. `--relatorio`: taxa de resposta e de avanço por ICP e por faixa de nota.
- [x] 10. `--go` da regra e da nota rodado na base; segunda execução ficou idempotente
      (`MUDANCAS: 0`).
- [ ] 11. `--ia --go` em lotes.
- [x] 12. Testes, lint, typecheck e build passam.

## Migration

- `scripts/migrations/20260924_deal_icp_points.sql` e `.rollback.sql` (o rollback devolve a
  nota base).
- **Aplicada em 24/09/2026** (dry-run antes). Verify:
  `node scripts/verify-20260924-deal-icp-points.mjs`, 2/2 checks, nenhuma nota alterada.

## Simulação (24/09/2026, nada gravado)

- Regra: 4.897 sim, 1.725 não, 2.662 indefinidos. Seriam 6.846 deals alterados:
  - 3.948 passam de nulo para sim
  - 1.491 passam de nulo para não
  - 4.927 notas sobem, 1.712 descem
- Sobram 1.311 indefinidos para a IA.
- IA (15 de maior nota): 14 não, 1 incerto, 0 falhas.

## Calibração (antes)

| ICP | contatados | responderam | avançaram | ganhos |
|---|---|---|---|---|
| sim | 449 | 16,9% | 4,5% (20) | 1 |
| não | 90 | 31,1% | 2,2% (2) | 0 |
| indefinido | 38 | 42,1% | 28,9% (11) | 5 |

- Fora do ICP responde mais (quase tudo refrigeração e climatização) e avança menos.
  Responder não é servir.
- Indefinido mistura clientes que vieram por indicação e nunca tiveram ICP preenchido. Não
  serve de comparação.
- Na faixa 80+, 10,4% avançam, contra cerca de 5% nas outras faixas.
- Amostra pequena: é direção, não prova.

## Dev Agent Record

### Agent Model Used

claude-opus-5-5

### File List

- `docs/stories/story-058-icp-tipado-nota-do-lead.md`
- `scripts/migrations/20260924_deal_icp_points.sql` (novo)
- `scripts/migrations/20260924_deal_icp_points.rollback.sql` (novo)
- `scripts/verify-20260924-deal-icp-points.mjs` (novo)
- `scripts/classify-icp.mjs`
- `scripts/lib/leadIngest.js`
- `src/lib/leadScoring.js`
- `src/lib/leadScoring.d.ts`
- `src/lib/aiQueryRouter.ts`
- `src/app/api/ai/route.ts`
- `src/components/DealDetailOverlay.tsx`
- `tests/lead-icp-score.test.ts` (novo)
- `package.json`

## Change Log

- 2026-09-24: Implementação, migration aplicada, simulação e calibração registradas.
- 2026-09-24: Backfill determinístico aplicado em 6.846 deals (510 na tentativa inicial e
  6.336 na retomada); verificação posterior encontrou zero mudanças pendentes.
