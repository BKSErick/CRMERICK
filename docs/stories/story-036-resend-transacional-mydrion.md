# Story 036 - Resend transacional da Mydrion no CRM ERICK

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@devops`, `@cyber-chief`

## Story

Como operador da Mydrion, quero manter no CRM ERICK um servico server-side de
email transacional via Resend, com teste manual controlado, para validar a
infraestrutura de envio sem expor a credencial, abrir endpoint publico ou
misturar a reputacao do dominio com a fila de prospeccao do Brevo.

## Contexto

O CRM ja possui `scripts/email/brevo_send.mjs`, voltado a cold email com fila,
throttle, deduplicacao e log. Essa operacao nao deve ser alterada. O Resend sera
usado pela Mydrion para comunicacoes transacionais e deve nascer como um servico
separado, reutilizavel e server-only.

Em 2026-08-20, o usuario escolheu explicitamente a opcao 1 do design: modulo
transacional, comando manual de teste e nenhuma rota publica nesta entrega. A
chave foi armazenada no `.env` local ignorado pelo Git e nunca deve aparecer em
codigo, teste, log, documento ou bundle do navegador.

## Decisoes aprovadas

- A integracao permanece no repositorio CRM ERICK e usa nomes da Mydrion.
- `RESEND_API_KEY` e lida exclusivamente do ambiente server-side.
- O primeiro remetente e `Mydrion <onboarding@resend.dev>` e pode ser substituido
  por `MYDRION_EMAIL_FROM` apos verificacao do dominio.
- O destinatario do teste e informado explicitamente na CLI.
- O comando valida sem enviar por padrao e exige `--send` para realizar envio.
- Nenhum teste, build ou quality gate realiza chamada real ao Resend.
- Brevo, fila, logs e scripts de prospeccao ficam inalterados.

## Acceptance Criteria

- [ ] A dependencia oficial `resend` esta instalada e o lockfile esta
  sincronizado.
- [ ] Um modulo server-side reutilizavel cria o cliente a partir de
  `process.env.RESEND_API_KEY`, valida remetente/destinatario/assunto/HTML e
  retorna o ID do envio.
- [ ] Erros de configuracao e do provider sao claros, mas nunca incluem a API
  key nem o corpo arbitrario retornado pelo provider.
- [ ] Um comando `email:mydrion:test` exige `--to=<email>` e nao envia nada sem a
  flag adicional `--send`.
- [ ] O remetente default de teste e `Mydrion <onboarding@resend.dev>` e pode ser
  trocado por `MYDRION_EMAIL_FROM` sem alteracao de codigo.
- [ ] `.env.example` documenta somente os nomes das variaveis, sem chave real ou
  placeholder que pareca uma credencial valida.
- [ ] Testes usam cliente falso e cobrem sucesso, configuracao ausente, payload
  invalido, erro do provider e ausencia de vazamento de segredo.
- [ ] Nenhum arquivo do motor Brevo ou da fila de prospeccao e modificado.
- [ ] Nenhum email real e enviado durante a implementacao ou validacao desta
  story.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Escrever testes RED para o contrato do servico Resend (AC: 2, 3, 7).
  - [x] Cobrir sucesso e normalizacao do payload.
  - [x] Cobrir chave ausente e campos invalidos.
  - [x] Cobrir erro sanitizado sem vazamento da chave.
- [x] Instalar o SDK e implementar o servico da Mydrion (AC: 1-5).
- [x] Criar CLI de teste segura e script npm (AC: 4, 5, 9).
- [x] Sincronizar `.env.example` e manter o segredo fora do Git (AC: 6).
- [x] Executar quality gates e atualizar checklist/File List (AC: 8-10).

## Fora de escopo

- Criar rota publica, botao ou formulario de envio no CRM.
- Substituir Brevo, enviar cold email ou importar a fila existente.
- Configurar recebimento de email ou caixa postal.
- Configurar DNS do dominio ou segredo da Vercel.
- Realizar o primeiro envio sem autorizacao explicita posterior.

## Dev Notes

- Design aprovado: `docs/plans/2026-08-20-mydrion-resend-design.md`.
- Plano: `docs/plans/2026-08-20-mydrion-resend.md`.
- O SDK retorna `{ data, error }`; tratar `error` antes de acessar `data.id`.
- O sender `onboarding@resend.dev` e apenas para teste controlado da conta.
- Preferir injecao do cliente `emails.send` nos testes e nenhuma rede.
- Preservar todas as alteracoes locais nao relacionadas ja presentes no checkout.

### Testing

- Unitario: contrato, validacao, retorno e sanitizacao.
- Integracao local: CLI em modo de validacao, sem `--send`.
- Regressao: suite completa existente, lint, typecheck e build.

## Rollout e rollback

- Rollout inicial somente local e server-side.
- O envio real depende de nova aprovacao e, para destinatarios externos, dominio
  verificado no Resend.
- Rollback remove dependencia, modulo, script, teste, scripts npm e placeholders
  de configuracao. Brevo nao exige rollback.

## CodeRabbit Integration

- Pre-Commit `@dev`: segredo, validacao, erro sanitizado, dry-run e isolamento do
  Brevo.
- Pre-Deployment `@devops`: variavel Vercel, dominio verificado, sender e
  observabilidade antes de liberar uso real.

## Change Log

| Data | Versao | Descricao | Autor |
| --- | --- | --- | --- |
| 2026-08-20 | 1.1 | SDK, servico server-side, CLI dry-run, testes e gates concluidos | @dev |
| 2026-08-20 | 1.0 | Story criada a partir do design aprovado | @dev |

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex (`@dev` / Dex)

### Debug Log References

- RED 1: `node --test tests/mydrion-email.test.ts` falhou com
  `ERR_MODULE_NOT_FOUND` antes da criacao do servico.
- RED 2: a mesma suite falhou em tres casos antes da criacao da CLI segura.
- RED 3: teste de excecao do provider reproduziu vazamento da mensagem arbitraria;
  captura e validacao foram separadas antes do GREEN.
- `node --test tests/mydrion-email.test.ts` - 8/8 PASS.
- `npm run email:mydrion:test -- --to=erickgit7@gmail.com` - validacao PASS,
  nenhum email enviado.
- `npm run lint` - PASS.
- `npm run typecheck` - PASS.
- `npm test` - 218/218 PASS.
- `npm run build` - PASS, 68 paginas e DNA dos 7 especialistas consistente.
- `npm ls resend --depth=0` - `resend@6.21.0` instalado; audit sem
  vulnerabilidades na instalacao.
- Scan de segredo em arquivos da story - nenhuma chave Resend encontrada.
- Diff dos scripts Brevo - inalterado.
- CodeRabbit nao executado: WSL sem distribuicao instalada nesta maquina.

### Completion Notes List

- Servico Mydrion encapsula o SDK Resend, valida payload e retorna somente o ID.
- Erros retornados ou lancados pelo provider sao sanitizados sem ecoar mensagem
  arbitraria, credencial ou payload sensivel.
- CLI exige `--to`, valida sem enviar por padrao e so chama a API com `--send`.
- A chave real permanece apenas no `.env` local ignorado e nao rastreado.
- O remetente de teste pode migrar para dominio verificado por
  `MYDRION_EMAIL_FROM` sem alteracao de codigo.
- Brevo, fila e logs de prospeccao nao foram modificados.
- `package-lock.json` local foi sincronizado pelo npm, mas segue ignorado pela
  politica atual deste repositorio.
- Nenhum email real foi enviado nesta story.

### File List

- `.env.example`
- `docs/plans/2026-08-20-mydrion-resend-design.md`
- `docs/plans/2026-08-20-mydrion-resend.md`
- `docs/stories/story-036-resend-transacional-mydrion.md`
- `package.json`
- `plan/self-critique-036-resend.json`
- `scripts/email/send-mydrion-test.mjs`
- `src/lib/mydrionEmail.d.mts`
- `src/lib/mydrionEmail.mjs`
- `tests/mydrion-email.test.ts`

## QA Results

- Pendente.
