# Story 052 - Rampa segura do disparo de e-mail Brevo

## Status

Ready for Review

## Story

Como operador comercial, quero iniciar os disparos em 20 e-mails por dia e aumentar
o limite conscientemente, para aquecer o dominio sem permitir que um parametro errado
ultrapasse o teto operacional de 250 por dia.

## Acceptance Criteria

- [x] O limite diario padrao do script e 20.
- [x] O operador pode configurar um limite positivo menor ou igual a 250.
- [x] Valores invalidos usam o padrao seguro e valores acima de 250 sao truncados.
- [x] O script continua sem enviar nada quando `--limit` nao e informado.
- [x] Existe teste unitario para a resolucao do limite.
- [x] Os testes focados, lint e typecheck passam.

## Tasks / Subtasks

- [x] Escrever teste RED para padrao, rampa e teto duro.
- [x] Extrair a resolucao do limite para funcao pura.
- [x] Aplicar a funcao ao motor Brevo.
- [x] Executar os gates e registrar o resultado.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED: o modulo ainda nao exportava `resolveDailyCap`.
- GREEN: testes cobrem padrao 20, rampa explicita, valores invalidos e teto 250.
- Execucao sem argumentos encerra antes de ler credenciais ou acessar a rede.
- Regressao: `npm.cmd test` passou 426/426; lint sem erros e typecheck passou.
- `npx.cmd next build --webpack` compilou 82 rotas.

### Completion Notes List

- O motor manual nasce em 20/dia e exige `--cap` explicito para subir a rampa.
- Limite de lote e limite diario nunca passam de 250, mesmo com parametro maior.
- Nenhum e-mail foi enviado durante a implementacao ou validacao.

### File List

- `docs/stories/story-052-rampa-segura-email-brevo.md`
- `scripts/email/brevo-support.mjs`
- `scripts/email/brevo_send.mjs`
- `tests/brevo-email.test.ts`

## Change Log

- 2026-09-10: Story criada com rampa inicial de 20 e teto operacional de 250.
- 2026-09-10: Guardas de rampa implementadas e validadas; story pronta para revisao.
