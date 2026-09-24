# Story 059 — Régua governante da prospecção

## Status

Done

## Story

Como operador da prospecção, quero que ICP e capacidade sejam gates anteriores ao score,
para falar de governante para governante e parar de consumir a fila com empresas que não
têm perfil ou caixa para a oferta principal.

## Estratégia dos clones

- **Willian Celso:** preservar a cadeia simbólica de autoridade. O CRM não confunde
  Governante com pedido de licença, não trata todo respondente como comprador e registra
  o motivo legível da decisão.
- **Thiago Finch:** proteger a economia do funil. Score ordena candidatos elegíveis, mas
  não compra entrada; microempresa alinhada vai para produto de entrada, não para a mesma
  oferta de projeto.

## Acceptance Criteria

- [x] 1. A fila industrial exige `is_icp=true`; falso ou indefinido fica retido.
- [x] 2. Anti-ICP explícito bloqueia mesmo com score alto: serralheria, marmoraria,
      refrigeração/climatização, assistência residencial, segurança eletrônica, varejo e
      outros serviços de consumo final.
- [x] 3. Capacidade é tipada como `governante`, `estruturado`, `micro` ou `incerto`, com
      evidências auditáveis. Só os dois primeiros entram na oferta principal.
- [x] 4. A decisão persiste `capacity_tier`, `capacity_evidence`, `decision_access`,
      `offer_track` e `eligibility_reason` no CRM.
- [x] 5. A mesma barreira roda antes da primeira abordagem e antes de todo follow-up.
- [x] 6. A vertical de eventos continua separada do ICP industrial e usa sua oferta própria.
- [x] 7. A fila já aprovada de 25/09 permanece com os mesmos 17 IDs, textos, manifestos e
      aprovações; dry-run confirmou 3/3 pela manhã e 14/14 à tarde.
- [x] 8. Nenhuma mensagem foi enviada durante implementação, backfill ou validação.
- [x] 9. Migration tem rollback e verificador; backfills são dry-run por padrão e
      idempotentes.
- [x] 10. Testes unitários, lint, typecheck, suite e build passam.

## Resultado na base (24/09/2026)

- 9.283 prospects avaliados.
- 977 na oferta de projeto: 913 `governante` e 64 `estruturado`.
- 142 `micro` separados para futura oferta de entrada.
- 8.164 retidos como `incerto/nenhuma`.
- Backfill final repetido em dry-run: `mudancas: 0`.

## Fila congelada de 25/09

| Arquivo | SHA-256 |
|---|---|
| `morning.manifest.json` | `DBD0CF627D4CBA435458BDB945D87629DF85C52509CE14A49E35148762D371EC` |
| `morning.approval.json` | `98E78AE42DA7D689810F3B38E25EF29D258EFC2BBC202B62606D0C0E3F2B5D90` |
| `afternoon.manifest.json` | `E3055886C06D6D19D07E9470DCE496BAE01C3EC2CC39250D49B70FC9EB46CEE3` |
| `afternoon.approval.json` | `E97E24B75FFDC34E38306769B0B7D645162139CA5B542A8F692A7D9649FB3AAE` |

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### File List

- `docs/stories/story-058-icp-tipado-nota-do-lead.md`
- `docs/stories/story-059-regua-governante-prospeccao.md`
- `scripts/classify-prospecting-eligibility.mjs`
- `scripts/migrations/20260924_prospecting_eligibility.sql`
- `scripts/migrations/20260924_prospecting_eligibility.rollback.sql`
- `scripts/verify-20260924-prospecting-eligibility.mjs`
- `scripts/uazapi-send-batch.mjs`
- `scripts/uazapi-followup-batch.mjs`
- `src/lib/prospectingEligibility.mjs`
- `src/lib/prospectingEligibility.d.ts`
- `tests/prospecting-eligibility.test.ts`
- `package.json`

## Change Log

- 2026-09-24: Gates, persistência, backfills, validação da fila congelada e documentação.
