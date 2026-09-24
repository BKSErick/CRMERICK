# Story 061 — Oferta Base Industrial para leads micro

## Status

Done

## Story

Como operador comercial, quero uma oferta de entrada fechada para leads industriais
micro, para monetizar capacidade menor sem baratear nem contaminar o projeto principal.

## Estratégia dos clones

- **Willian Celso:** produto e preço devem comunicar estrutura, limite e direção. A oferta
  não pede licença, não usa preço de infoproduto e não se apresenta como desconto.
- **Thiago Finch:** o piloto precisa ter margem, capacidade máxima, critério de corte e
  upgrade definidos antes de receber volume.

## Acceptance Criteria

- [x] 1. O playbook versiona a `Base Industrial` por R$ 600 de implantação e R$ 80/mês.
- [x] 2. O escopo é fechado e não inclui Pedido Pronto, design customizado, múltiplas
      páginas, integrações, produção de copy ou fotografia.
- [x] 3. A contribuição de implantação e mensal permanece em pelo menos 60% nos limites
      operacionais aprovados.
- [x] 4. O texto oferece a entrada diretamente, com preço, prazo e vaga, sem pedir licença.
- [x] 5. A Sala de Comando mostra uma fila manual separada, limitada a 20 leads com
      `offer_track=entrada`; ela não entra na fila nem no disparo automático.
- [x] 6. O piloto tem regras explícitas de scale/kill e crédito de R$ 300 no upgrade em 30 dias.
- [x] 7. Testes, lint, typecheck e build passam sem alterar a fila congelada de 25/09.

## Validação final

- Implantação: contribuição de R$ 370 (61,7%) no limite de 2 horas.
- Mensalidade: contribuição aproximada de R$ 49,33 (61,7%) no limite de 10 minutos.
- Suite completa: 580 testes aprovados; typecheck e build aprovados.
- Lint sem erros; 2 warnings preexistentes em `SessionWatcher.tsx` e `Sidebar.tsx`.
- Os quatro hashes dos lotes congelados de 25/09 permaneceram idênticos.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### File List

- `docs/stories/story-061-oferta-base-industrial.md`
- `content/sales-playbook.json`
- `src/lib/salesPlaybook.mjs`
- `src/app/api/comando/route.ts`
- `src/app/comando/page.tsx`
- `tests/sales-automation.test.ts`

## Change Log

- 2026-09-24: Story aberta; contrato financeiro e operacional definido.
- 2026-09-24: Oferta versionada, cockpit manual e gates concluídos.
