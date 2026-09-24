# Story 064 — Filas visuais na régua, exceção manual e gate Thiago Finch

## Status

Done

## Story

Como operador da prospecção, quero que as filas da tela sigam a mesma régua do disparo, que
a exceção a essa régua exija evidência e aprovador, e que nenhum lote novo saia enquanto a
economia do funil não fechar, para que nenhum anti-ICP apareça pronto para copiar e nenhuma
resposta qualificada fique parada enquanto chega volume novo.

Fecha os itens P0 e P7 do checklist de execução de 24/09/2026.

## Estratégia dos clones

- **Thiago Finch:** especificou o gate com números derivados dos parâmetros aprovados
  (R$100/h, taxa de 5%, margem mínima de 60%):
  - Tier B tem 7 toques manuais por lead e Tier A tem 11;
  - resposta qualificada parada há mais de 4 horas úteis segura qualquer lote novo;
  - scale e kill ficam separados por tier.
- **Ajuste ao checklist:** o critério 3 é "decidir **ou encaminhar**". Por isso gatekeeper
  passa e só bot retém. `decision_access` incerto passa no primeiro contato frio, porque
  reter zeraria a cadência.

## Acceptance Criteria

- [x] 1. P0: `retencaoFilaFria()` aplica a régua nas filas visuais:
  - `followupQueue` e `referralQueue` da Sala de Comando;
  - follow-up e primeiro contato da tela `/disparo`.

  O que sai e o que fica:
  - Anti-ICP ou `is_icp=false` em estágio frio sai sempre.
  - Inelegível sem resposta esperando também sai.
  - Inelegível com resposta humana esperando fica, mas sem template M1-M3.
  - Estágio avançado e eventos ficam protegidos.
- [x] 2. P0: `deals.eligibility_exception` (migration com rollback e check constraint) guarda
      evidência, tier, aprovador e data. `excecaoValida()` ignora exceção incompleta ou com
      tier `micro`. O único caminho de escrita é
      `scripts/approve-eligibility-exception.mjs`, com dry-run por padrão.
- [x] 3. P7, por lead (`avaliarGateFinchLead`):
  - os quatro gates;
  - a oferta bate com o tier (Tier A nunca lê R$1.000, Tier B nunca lê a faixa do site);
  - bot retém;
  - o degrau tem próximo passo no playbook (`finchGate.nextSteps`);
  - os toques manuais cabem no teto da oferta (`orcamentoHumanoDaOferta`).
- [x] 4. P7, por lote (`avaliarGateFinchLote`):
  - métrica de avanço definida e lote anterior classificado;
  - zero respostas qualificadas paradas (`respostasQualificadasParadas`, horas úteis de
    Brasília);
  - volume dentro do piloto e sem kill disparado.
- [x] 5. `prepare-prospecting-day.mjs` zera as primeiras mensagens novas enquanto houver
      resposta qualificada parada (follow-up de cadência segue). O disparo de manifesto já
      aprovado não muda.
- [x] 6. Teste de regressão do P1: JL Serralheria, Mega Refrigeração, Tim Lavadoras e
      Emerson Eletricista ficam bloqueados com 90 pontos, a Policápsula não é anti-ICP e a
      usinagem estruturada é mantida.

## Validação

- Migration `20260925_eligibility_exception.sql`: dry-run com rollback validado e aplicada
  (HTTP 201) pela Management API. O arquivo não tem `begin/commit` próprios de propósito:
  as migrations anteriores têm, e com isso o `--dry-run` do `apply-migration.mjs` na
  verdade grava.
- `tests/finch-gate.test.ts` (8) e `tests/prospecting-eligibility.test.ts` (17).
- Fila de 25/09: dry-run com os IDs literais devolveu 3/3 e 14/14, na mesma ordem.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5

### File List

- `docs/stories/story-064-filas-visuais-excecao-gate-finch.md`
- `src/lib/finchGate.mjs`
- `src/lib/prospectingEligibility.mjs`
- `src/lib/prospectingEligibility.d.ts`
- `src/lib/crmRecords.ts`
- `src/app/api/comando/route.ts`
- `src/app/disparo/page.tsx`
- `scripts/approve-eligibility-exception.mjs`
- `scripts/classify-prospecting-eligibility.mjs`
- `scripts/prepare-prospecting-day.mjs`
- `scripts/uazapi-send-batch.mjs`
- `scripts/uazapi-followup-batch.mjs`
- `scripts/migrations/20260925_eligibility_exception.sql`
- `scripts/migrations/20260925_eligibility_exception.rollback.sql`
- `content/sales-playbook.json`
- `tests/finch-gate.test.ts`
- `tests/prospecting-eligibility.test.ts`

## Change Log

- 2026-09-24: Régua nas filas visuais, exceção manual com migration e gate Finch.
