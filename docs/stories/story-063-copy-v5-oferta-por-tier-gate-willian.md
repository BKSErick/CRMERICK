# Story 063 — Copy v5 por situação, oferta por tier e gate Willian Celso

## Status

Done

## Story

Como operador comercial, quero que cada tier receba a oferta que cabe na capacidade dele e
que nenhuma mensagem saia sem passar por um gate de texto, para parar de oferecer a página
de R$1.000 a quem compra projeto e de mandar texto que pede licença, cita dois cases ou usa
termo morto.

Fecha os itens P3, P5 e P6 do checklist de execução de 24/09/2026.

## Estratégia dos clones

- **Willian Celso:** escreveu a copy v5 dentro da doutrina viva. Tier A ganha case e
  proposta escrita para quem decide, sem preço. A âncora de R$1.800 só entra na proposta,
  porque falar de dinheiro antes de confirmar o decisor é falar com a pessoa errada. Na
  ligação, o Governante mantém a conversa no texto. O M2 cita um case só.
- **Decisão do Erick (24/09):** Tier A recebe projeto sob medida, com preço só na proposta,
  a partir de R$1.800 + R$200/mês (a faixa do site), e nunca R$1.000 no WhatsApp. Tier B
  segue com R$1.000 + R$150. A copy v5 entra no playbook e é aprovada pelo hash do piloto.

## Acceptance Criteria

- [x] 1. P3: Tier A (governante) exige EPP/DEMAIS **com site** e sinal industrial. EPP/DEMAIS
      sem site vira Tier B (estruturado), continua elegível e leva o motivo na regra.
- [x] 2. P3: `ofertaDoLead()` escolhe a oferta pelo tier: governante recebe `projectOffer`,
      estruturado recebe `offer` (R$1.000) e micro recebe `entryOffer`. `offer_track`
      continua `projeto|entrada|nenhuma`, sem mudar a constraint do banco.
- [x] 3. P5: o playbook (`copy-2026-09-24.1-v5`) tem as dez situações:
  - Tier A (`tierA.oferta`) e Tier B (`msg2`);
  - reconhecimento forte (`msg2`/`tierA.oferta`) e fraco (`msg2Ponte`);
  - decisor indicado e gatekeeper/bot (`routing`);
  - encerramento anti-ICP (`naoForaIcp`, sem desculpa) e "já tenho fornecedor" (`naoJaTem`);
  - retomada sem preço por tier (`retomadaSemPreco`, `retomadaSemPrecoTierA`);
  - pedido direto de ligação (`pedidoLigacao`).
- [x] 4. P5: o M2 cita um case só, com o link na mensagem e sem "Se quiser ver como ficou".
      Manutenção recebe Jotta; usinagem e caldeiraria recebem Metalthec; concorrente da
      Jotta nunca lê o nome dela.
- [x] 5. P5/P6: `src/lib/copyGate.mjs` bloqueia:
  - "faz sentido", "quer ver", "posso te mostrar", "se quiser" e a Ficha de Escopo;
  - elogio genérico e "presença digital" sem mecanismo;
  - dois ou mais cases;
  - emoji ou "show" com Tier A;
  - preço em degrau de Mago;
  - pedido de licença ou desculpa;
  - termo morto, travessão e as palavras a evitar do brandbook.

  Cada critério do Willian sai como `ok`, `falha` ou `manual`, e qualquer `falha` reprova.
- [x] 6. P6: o gate roda:
  - no render do follow-up automático (`uazapi-followup-batch.mjs`);
  - na coleta de primeiro contato (`uazapi-send-batch.mjs`, só quando não há `--ids`);
  - no piloto;
  - nos testes, sobre todo texto do playbook.
- [x] 7. Texto fixo em código saiu:
  - as cartas da Sala de Comando (incluindo "Quer ver?", "Quer dar uma olhada?", "se o
    escopo fez sentido", "não quero te pressionar") foram para `playbook.comando`;
  - o decisor indicado de `extract-referrals.mjs` passou a usar o playbook;
  - "operação de verdade" saiu do gerador de msg 1;
  - o fallback "Posso te mandar uma análise rápida?" saiu da tela `/disparo`.
- [x] 8. Hook da doutrina viva lê as chaves novas (M2 genérico, oferta por tier, Tier A) sem
      imprimir `undefined`.
- [x] 9. Fila congelada de 25/09 intacta: os gates novos só valem na coleta, e o dry-run com
      os IDs literais devolveu 3/3 e 14/14 na mesma ordem.

## Validação

- `tests/copy-gate.test.ts` (9), `tests/sales-automation.test.ts` (16, incluindo o gate
  sobre todos os textos do playbook) e `tests/prospecting-eligibility.test.ts`.
- Os 17 textos de 25/09 são todos de casas de evento, com a copy de evento aprovada em
  24/09 (com emoji). Eles ficam fora do gate industrial, como já estava decidido para a
  vertical. Auditados só em modo relatório.

## Pendente de decisão do Erick

- `pedidoLigacao`: o Willian decidiu manter a conversa no texto também para quem pede
  ligação. É a decisão mais sensível da v5; o piloto mede isso.
- As cartas de lead quente do Comando (reunião, no-show, proposta D+2/D+7) foram
  reescritas no mínimo para passar no gate. Conferir o tom.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (clones Willian Celso e Thiago Finch como subagentes, com o bloco da doutrina viva no prompt)

### File List

- `docs/stories/story-063-copy-v5-oferta-por-tier-gate-willian.md`
- `content/sales-playbook.json`
- `src/lib/copyGate.mjs`
- `src/lib/salesPlaybook.mjs`
- `src/lib/prospectingEligibility.mjs`
- `src/lib/prospectingEligibility.d.ts`
- `src/lib/inboundReading.mjs`
- `src/app/comando/page.tsx`
- `src/app/disparo/page.tsx`
- `scripts/uazapi-followup-batch.mjs`
- `scripts/uazapi-send-batch.mjs`
- `scripts/extract-referrals.mjs`
- `scripts/regenerate-copies.js`
- `scripts/doutrina-viva-hook.cjs`
- `tests/copy-gate.test.ts`
- `tests/sales-automation.test.ts`
- `tests/prospecting-eligibility.test.ts`
- `package.json`

## Change Log

- 2026-09-24: Copy v5, oferta por tier, gate de texto e cartas do Comando no playbook.
