# Story 062 — Classificação por IA dos ICPs indefinidos

## Status

In Progress

## Story

Como operador da prospecção, quero classificar os ICPs que a regra determinística não
resolve, para liberar somente decisões sustentadas por evidência e manter o restante
bloqueado sem gastar provedor pago.

## Acceptance Criteria

- [x] 1. A IA usa somente a política `free-strict`, sem fallback pago ou de custo incerto.
- [x] 2. `sim` e `não` só são aceitos com confiança alta e evidência literal suficiente
      nos campos recebidos; qualquer ambiguidade vira `incerto`.
- [x] 2.1. O provedor recebe somente segmento, CNAE e porte; nome, telefone, contato, ID
      e conversa não saem do CRM.
- [x] 3. A decisão grava evidência, confiança, modelo e horário para auditoria.
- [x] 4. Estágios avançados nunca são rebaixados para fora do ICP pela IA.
- [x] 5. Falha de provedor, JSON, evidência ou persistência deixa o lead indefinido e
      bloqueado; não existe abertura silenciosa de fila.
- [x] 6. O processamento é retomável em lotes e não envia mensagens nem altera a fila
      congelada de 25/09.
- [x] 7. A migration é verificada em dry-run antes da aplicação remota.
- [ ] 8. Testes, lint, typecheck e build passam; o relatório final informa classificados,
      incertos e falhas reais.

## Validação parcial

- Migration validada em transação com rollback e aplicada em produção (HTTP 201).
- Regra determinística idempotente: 0 mudanças pendentes.
- Candidatos ativos ainda indefinidos e fora de eventos: 1.308.
- Dry-runs OpenRouter: 0 classificados, 0 incertos persistidos, 8 falhas de itens testados;
  todos os modelos tentados responderam HTTP 429. Nenhum PATCH de classificação foi feito.
- Suite completa: 580 testes aprovados; lint sem erros, typecheck e build aprovados.
- Os quatro hashes dos lotes congelados de 25/09 permaneceram idênticos.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### File List

- `docs/stories/story-062-classificacao-ia-icp-fail-closed.md`
- `src/lib/icpAiClassification.mjs`
- `scripts/classify-icp.mjs`
- `scripts/migrations/20260924_icp_ai_audit.sql`
- `scripts/migrations/20260924_icp_ai_audit.rollback.sql`
- `scripts/supabase-schema.sql`
- `tests/lead-icp-score.test.ts`

## Change Log

- 2026-09-24: Story aberta com política gratuita e decisão fail-closed.
- 2026-09-24: Migration validada com rollback e aplicada; 1.308 candidatos medidos.
- 2026-09-24: Execução externa pausada pelo gate de egress até autorização explícita do OpenRouter.
