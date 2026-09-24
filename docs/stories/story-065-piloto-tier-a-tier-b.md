# Story 065 — Piloto controlado 20 Tier A + 20 Tier B

## Status

Ready for Review. As ferramentas estão prontas; o congelamento está retido pelo próprio
gate (ver "Estado em 24/09").

## Story

Como operador comercial, quero um piloto de 40 leads (20 Tier A, 20 Tier B) auditado lead a
lead e aprovado por hash, com placar separado por tier que mede avanço de funil e não só
resposta, para decidir com número se cada oferta escala ou morre.

Fecha o item P8 do checklist de execução de 24/09/2026.

## Acceptance Criteria

- [x] 1. `scripts/prepare-pilot-batch.mjs` monta o piloto. Passa primeiro pelo gate Finch
      de lote, depois coleta com a mesma régua do disparo e cota por tier
      (`--por-tier=governante:20,estruturado:20`), com triagem, canal conferido na Uazapi,
      gate de texto e gate Finch por lead. Sem `--go` mostra só a prévia; com `--go` congela
      dois manifestos v2 (manhã e tarde, A e B intercalados) e a auditoria em branco.
- [x] 2. Cada lead do manifesto v2 salva empresa, evidência, tier, acesso ao decisor, a
      mensagem exata, a oferta e os dois gates, e tudo isso entra no hash
      (`canonicalManifest` v2). O v1 continua byte a byte igual, então a fila de 25/09
      segue válida.
- [x] 3. Auditoria manual dos 40 (`scripts/audit-pilot.mjs`): lê cada lead e registra
      aprovação ou reprovação. Aprovar confirma os critérios manuais do Willian que regex
      não decide.
- [x] 4. `approve-prospecting-day.mjs` recusa manifesto v2 com qualquer um destes:
      gate reprovado, lead sem auditoria, critério manual sem confirmação, lead reprovado
      ou auditoria feita sobre outra versão do manifesto (`pilotAuditIssues`).
- [x] 5. Disparo só depois do hash aprovado. O envio confere que o `copy_text` do banco
      ainda é o texto aprovado (`--manifest`); se a copy mudou, o lead não sai.
- [x] 6. `scripts/pilot-report.mjs` gera o placar por tier (`src/lib/pilotMetrics.mjs`):
  - decisor alcançado
  - reconhecimento
  - case aceito
  - preço apresentado
  - entrada de produção
  - proposta
  - venda
  - motivo real de perda

  Resposta aparece como métrica secundária.
- [x] 7. O relatório alimenta o gate Finch do próximo lote: resposta sem leitura tipada,
      kill (A: menos de 3 reconhecimentos em 20 com a janela encerrada, ou 3 propostas sem
      produção; B: menos de 3 avanços ou 5 preços sem venda) e scale (nunca automático).
- [ ] 8. Congelar os 40 para 28/09. **Retido** pelas duas condições abaixo.

## Estado em 24/09 (prévia `logs/pilot-2026-09-28-previa.log`)

1. **Gate Finch de lote reprovado:** 52 respostas qualificadas paradas (22 abordado, 13
   followup, 12 prospect, 5 qualified; só 2 nas últimas 40 horas úteis). A lista está em
   `logs/respostas-paradas-2026-09-24.txt`. Anti-ICP em estágio frio já não conta, porque
   resposta de refrigeração não é resposta qualificada.
2. **Oferta insuficiente de leads:** só 4 Tier A e 1 Tier B passaram por todos os gates.
   Na base inteira, os elegíveis que ainda estão em `prospect` são 49 A e 21 B. Desses,
   40 não têm `copy_text`, 21 estão fora dos quatro segmentos do disparo e só 9 têm canal
   confirmado (jid ou WhatsApp do site).

Para destravar, na ordem:

- responder ou encerrar as 52 respostas paradas;
- gerar copy e conferir número dos elegíveis sem copy e sem canal;
- puxar leads novos para completar o Tier B (gasta crédito do Serper; decisão do Erick).

Depois rodar `node scripts/prepare-pilot-batch.mjs --date=<dia útil> --go`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5

### File List

- `docs/stories/story-065-piloto-tier-a-tier-b.md`
- `src/lib/prospectingApproval.ts`
- `src/lib/pilotMetrics.mjs`
- `scripts/prepare-pilot-batch.mjs`
- `scripts/audit-pilot.mjs`
- `scripts/pilot-report.mjs`
- `scripts/approve-prospecting-day.mjs`
- `scripts/dispatch-approved-batch.mjs`
- `scripts/uazapi-send-batch.mjs`
- `content/sales-playbook.json`
- `tests/prospecting-pilot.test.ts`

## Change Log

- 2026-09-24: Manifesto v2, auditoria, aprovação, conferência de copy no envio e placar.
  Prévia do piloto rodada: congelamento retido pelo gate Finch e pela falta de leads.
