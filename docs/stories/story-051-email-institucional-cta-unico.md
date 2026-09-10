# Story 051 - CTA unico no e-mail institucional da Mydrion

## Status

Ready for Review

## Story

Como operador comercial, quero que o primeiro e-mail institucional tenha uma unica
saida comercial e nenhum numero de WhatsApp incorreto, para manter a mensagem clara
e evitar encaminhar o lead para um contato invalido.

## Acceptance Criteria

- [x] O e-mail institucional renderiza exatamente um link comercial.
- [x] O unico link aponta para o site oficial da Mydrion com a atribuicao UTM existente.
- [x] O template nao renderiza `wa.me` nem o numero incompleto `553191072407`.
- [x] Existe teste de regressao cobrindo HTML e texto simples.
- [x] Os testes focados, lint e typecheck passam.

## Tasks / Subtasks

- [x] Escrever teste RED para o contrato de CTA unico.
- [x] Remover o CTA concorrente de WhatsApp do template.
- [x] Atualizar exemplos de classificacao para o numero canonico quando aplicavel.
- [x] Executar os gates e registrar o resultado.

## Dev Agent Record

### Agent Model Used

- Codex GPT-5

### Debug Log References

- RED: teste encontrou 2 links comerciais no HTML em vez de 1.
- GREEN: `node --test tests/brevo-email.test.ts tests/email-funnel.test.ts` passou 30/30.
- Regressao: `npm.cmd test` passou 426/426; lint sem erros e typecheck passou.
- `npm.cmd run build` compilou 82 rotas depois da sincronizacao oficial do DNA
  `alex-hormozi` solicitada antes da publicacao.
- CodeRabbit indisponivel porque este host nao possui uma distribuicao WSL operacional.

### Completion Notes List

- O CTA concorrente de WhatsApp foi removido do HTML e do texto simples.
- O unico link agora usa o dominio canonico `www.mydrion.com.br` e preserva UTMs.
- A fila operacional foi reconstruida: 3 pendentes, cada um com exatamente 1 link
  comercial e nenhum `wa.me` ou numero incompleto.
- Nenhum e-mail foi enviado e nenhuma automacao foi ativada.

### File List

- `docs/stories/story-051-email-institucional-cta-unico.md`
- `scripts/email/copy-institucional.mjs`
- `tests/brevo-email.test.ts`
- `tests/email-funnel.test.ts`

## Change Log

- 2026-09-10: Story criada a partir da aprovacao explicita do operador.
- 2026-09-10: CTA unico implementado e validado; story pronta para revisao.
