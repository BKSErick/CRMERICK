# Story 004 - Carteira dinamica em React

## Status
Ready for Dev

## Story
Como Erick, quero que a Carteira mostre clientes ativos e MRR calculados a partir dos deals ganhos, para substituir a tabela financeira mockada.

## Acceptance Criteria
- [x] A rota `/carteira` deixa de ser placeholder.
- [x] MRR ativo soma `value` dos deals em `won`.
- [x] Clientes ativos sao derivados de contatos associados a deals ganhos.
- [x] A tela sinaliza alerta de churn quando nao ha interacao recente registrada.
- [x] O HTML legado permanece intacto.
- [x] Quality gates aplicaveis passam.

## Tasks / Subtasks
- [x] Criar pagina React para `/carteira`.
- [x] Calcular MRR, ticket medio e clientes ativos pela store.
- [x] Criar tabela de clientes ativos.
- [x] Criar alerta de churn simples por `updated_at`.
- [x] Atualizar navegacao para marcar Carteira como migrado.
- [x] Executar lint e build.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `npm.cmd run lint`
- `npm.cmd run build`

### Completion Notes List
- A Carteira agora usa a mesma store reativa da Home e Funis.
- Deals ganhos sem `updated_at` aparecem como alerta de acompanhamento.

### File List
- `docs/stories/story-004-carteira-dinamica.md`
- `src/app/carteira/page.tsx`
- `src/app/globals.css`
- `src/lib/navigation.ts`

### Change Log
- 2026-07-06: Migrada rota Carteira para React com MRR e alertas derivados da store.
