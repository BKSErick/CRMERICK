# Story 053 - Limite e deduplicacao centrais do e-mail

## Status

Ready for Review

## Story

Como operador comercial, quero que o limite diario e a deduplicacao consultem o CRM,
para que envios feitos por outra execucao ou maquina nao sejam ignorados pelo motor.

## Acceptance Criteria

- [x] O total diario usa atividades `email_sent` do CRM no fuso de Sao Paulo.
- [x] Falha ao consultar o total central interrompe o lote antes do primeiro envio.
- [x] O log local permanece apenas como protecao complementar.
- [x] A fila exclui enderecos e dominios ja registrados em atividades de envio.
- [x] Existem testes para fronteira de dia e extracao segura do destinatario.
- [x] Os testes focados, lint e typecheck passam.

## Tasks / Subtasks

- [x] Escrever testes RED para contagem central e parsing da atividade.
- [x] Consultar atividades recentes antes de calcular o orcamento diario.
- [x] Unir historico remoto e log local na deduplicacao da fila.
- [x] Executar check real sem envio e os gates locais.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- Check anterior mostrou divergencia `CRM=12` versus `log local=0`.
- Testes cobrem virada UTC no fuso de Sao Paulo, falha fechada e parsing do destinatario.
- Check real final, na pasta operacional, confirmou `12/20` tanto no CRM central
  quanto no log local, remetente ativo e MX funcional.
- Regressao: `npm.cmd test` passou 426/426; lint sem erros e typecheck passou.
- `npx.cmd next build --webpack` compilou 82 rotas.

### Completion Notes List

- O orcamento diario agora usa a fonte central antes de qualquer envio.
- A fila combina atividades centrais e `sent_log.json` para bloquear repeticao de
  endereco e de dominio empresarial.
- A reconstrucao ao vivo reduziu a fila antiga de 12 para 3 destinatarios realmente
  pendentes, sem reintroduzir enderecos ja enviados.
- O check real usou `--check`: zero e-mails enviados.

### File List

- `docs/stories/story-053-email-cap-e-dedup-centrais.md`
- `scripts/email/brevo-support.mjs`
- `scripts/email/brevo_send.mjs`
- `scripts/email/build-queue-institucional.mjs`
- `tests/brevo-email.test.ts`

## Change Log

- 2026-09-10: Story criada apos o check real revelar divergencia entre CRM e log local.
- 2026-09-10: Contagem e deduplicacao centrais implementadas; story pronta para revisao.
