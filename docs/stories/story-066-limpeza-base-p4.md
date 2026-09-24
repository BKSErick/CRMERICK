# Story 066 — Limpeza residual da base (P4)

## Status

Done (releituras e ICP restantes dependem da cota diária do Groq)

## Story

Como operador da prospecção, quero a base limpa depois dos critérios novos, para que todo
lead prospectável tenha fit, capacidade, acesso, oferta e evidência, e para que anti-ICP,
thread órfã e contato que não é prospect não contaminem fila nem relatório.

Fecha o item P4 do checklist de execução de 24/09/2026.

## Acceptance Criteria

- [x] 1. Testes com os casos de regressão do P1 antes de qualquer gravação (Story 064, AC 6).
- [x] 2. Classificação fortalecida aplicada:
  - ICP pela IA no Groq: 638 gravados (Story 062);
  - regra reaplicada depois da normalização;
  - régua de elegibilidade rematerializada.
- [x] 3. Segmentos normalizados pelo `normalize-segments.mjs` (determinístico e idempotente).
      A mesma passada grava `is_prospect=false` em cliente, contato pessoal e thread solta.
- [x] 4. Cadência de anti-ICP encerrada (`scripts/encerrar-anti-icp.mjs`):
  - **80** deals em abordado/followup foram para lost (`no_fit`, `blocker=fora_icp`), cada
    um com atividade `stage_change`;
  - **28** foram para revisão do Erick (CNAE industrial ou nome industrial com palavra
    anti-ICP, e `is_icp=false` da regra sem anti-ICP explícito). Exemplos: NDM Máquinas
    Industriais, "E&A Usinagem e Serralheria", Calinus Indústria. O caminho é
    `approve-eligibility-exception.mjs`;
  - **27** têm resposta humana esperando e não foram encerrados sozinhos. O Erick responde
    com a carta `naoForaIcp` ou encerra.
- [x] 5. Threads órfãs (`scripts/religar-orfaos.mjs`):
  - de **37**, **6** foram religadas por match único de telefone: mensagens e atividades
    passaram para o deal da empresa (Helmo, Salatini, Agência Astro e outras) e o órfão saiu
    da prospecção;
  - **31** não têm empresa no CRM com o mesmo número e ficaram fora da prospecção pela
    normalização.
- [x] 6. Clientes, indicações e contatos pessoais fora da prospecção fria:
  - 26 não-prospects sem marca receberam `is_prospect=false` na normalização;
  - nenhuma indicação nem cliente (por `origin`) em estágio frio.
- [ ] 7. Leitura tipada das respostas: **788** mensagens pendentes. Um teste com 10 mostrou o
      Groq no limite do dia (6 lidas, 4 recusadas por cota, nada gravado). Rodar
      `npm run ai:reler-whatsapp -- --go --limite=100` por dia, como a Story 057 prevê.
      Os 117 deals abertos que responderam entram nessa leitura.
- [ ] 8. Revisão manual da primeira página do ranking: a prévia do piloto (Story 065) lista
      os 40 primeiros elegíveis por tier, com evidência, oferta, copy e gates. A revisão é do
      Erick.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5

### File List

- `docs/stories/story-066-limpeza-base-p4.md`
- `scripts/encerrar-anti-icp.mjs`
- `scripts/religar-orfaos.mjs`

## Change Log

- 2026-09-24: Normalização, anti-ICP encerrado, órfãs religadas e pendências de cota registradas.
