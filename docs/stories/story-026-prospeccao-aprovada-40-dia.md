# Story 026 - Prospeccao aprovada com 40 envios por dia

## Status

Done

## Story

Como operador comercial, quero preparar e agendar os lotes de WhatsApp com uma
aprovacao de uso unico, para atingir 40 envios confirmados por dia sem disparar
antes do meu OK e sem perder leads alem do limite de 1.000 linhas do PostgREST.

## Acceptance Criteria

- [x] Todas as leituras operacionais de deals, contacts e activities usadas no
  disparo, follow-up e check de numero sao paginadas.
- [x] Teste reproduz 1.420 registros e prova que nenhum fica invisivel.
- [x] Sete Lagoas recebe copy antes da preparacao, sem envio externo.
- [x] Dois manifests congelam candidatos para manha e tarde de 11/08/2026.
- [x] Sem aprovacao valida, o dispatcher encerra sem chamar scripts com `--go`.
- [x] Aprovacao e ligada ao hash do manifest, data e slot, e so pode ser consumida uma vez.
- [x] Meta acumulada e 20 confirmados pela manha e 40 ao fim da tarde.
- [x] O contador do banco impede o 41o envio, incluindo envios ja registrados no dia.
- [x] Falha de conexao ou duas falhas consecutivas continua interrompendo o envio.
- [x] Janela comercial, intervalos aleatorios, pausas, teto horario, opt-out e canal
  confirmado continuam obrigatorios nos dois lotes.
- [x] Instagram nao recebe automacao de primeira mensagem.
- [x] Tarefas Windows de 11/08/2026 sao criadas e verificadas.
- [x] Lint, typecheck, testes e build passam.

## Tasks / Subtasks

- [x] Criar teste RED e helper de paginacao.
- [x] Migrar envio, follow-up e check de numeros para o helper.
- [x] Adicionar IDs congelados, exclusoes e exportacao de manifests.
- [x] Criar dominio e scripts de aprovacao idempotente.
- [x] Gerar copies de Sete Lagoas sem enviar.
- [x] Preparar manifests e tarefas agendadas de amanha.
- [x] Rodar quality gates e atualizar esta story.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED inicial: 4 testes verdes de dominio e 2 falhas por integracao/scripts ausentes.
- GREEN: 7 testes dedicados, incluindo 1.420 registros, gate e travas antibloqueio.

### Completion Notes List

- 204 copies de Sete Lagoas gravadas; verificacao posterior encontrou zero prospects sem copy.
- Manifestos locais ignorados pelo Git: 10 follow-ups + 30 primeiros contatos por slot.
- Dispatcher sem aprovacao validado nos dois slots com zero envio.
- Tarefas Windows `Ready`: 09:05 e 14:05, polling a cada 5 minutos dentro da janela.
- Follow-up agora tambem recusa telefone vindo apenas do Maps sem JID ou WhatsApp oficial.
- Gates: lint, typecheck, 86 testes e build Next aprovados.

### File List

- `docs/plans/2026-08-10-prospeccao-aprovada-design.md`
- `docs/plans/2026-08-10-prospeccao-aprovada.md`
- `docs/stories/story-026-prospeccao-aprovada-40-dia.md`
- `package.json`
- `scripts/approve-prospecting-day.mjs`
- `scripts/dispatch-approved-batch.mjs`
- `scripts/lib/supabaseRest.mjs`
- `scripts/prepare-prospecting-day.mjs`
- `scripts/prospeccao-aprovada.cmd`
- `scripts/uazapi-check-numbers.mjs`
- `scripts/uazapi-followup-batch.mjs`
- `scripts/uazapi-send-batch.mjs`
- `src/lib/prospectingApproval.ts`
- `tests/supabase-pagination.test.ts`

## Change Log

- 2026-08-10: Story criada apos confirmacao de Instagram manual e meta de 40/dia.
- 2026-08-10: Implementacao, preparacao operacional e agendamento concluidos.
