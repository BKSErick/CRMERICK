# Story 033 - Alocacao de id por sequencia em deals e contacts

## Status

Draft

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@data-engineer`

## Story

Como operador do CRM, quero que toda insercao em `deals` e `contacts` use a
sequencia do banco para gerar o id, para que nenhuma carga em massa volte a
quebrar silenciosamente a captura de leads.

## Contexto

Em 12/08/2026 o quiz do linkbio parou de gravar lead nenhum. A investigacao
mostrou que a causa nao era o quiz.

O trigger `quiz_leads_materialize_deal` (BEFORE INSERT em `quiz_leads`) insere em
`public.deals` sem informar `id`, usando o default `nextval('deals_id_seq')`.
Em paralelo, `prospectingRepository.createDeal` e a carga dos associados da
ACIMON inserem com **id explicito**, calculado no codigo como
`max(ultimo contact, ultimo deal) + 1`. Insercao com id explicito nao avanca a
sequencia.

Com o tempo a sequencia ficou para tras: `deals_id_seq` estava em **1034**
enquanto `max(deals.id)` era **1432**. Toda insercao em `quiz_leads` estourava
`deals_pkey` e a API devolvia 500. O mesmo vale para `POST /api/deals` e
`POST /api/contacts`, que tambem dependem do default.

O sintoma ficou invisivel porque `errorResponse` em `/api/quiz-leads` so lia
`error.message` quando o erro era instancia de `Error`; erro do supabase-js e um
`PostgrestError`, objeto simples, entao toda falha de banco virava
"Erro inesperado" sem code nem details. Isso ja foi corrigido no commit
`05973a5`.

As sequencias de `deals` e `contacts` foram realinhadas com `setval` para
`max(id)` = 1432. **Isso e paliativo:** a proxima carga com id explicito
desalinha de novo. Esta story trata a causa.

## Dependencias

- Nenhuma. E correcao de fundo e pode ser feita isolada.
- Commit `05973a5` ja entregou a visibilidade do erro e nao precisa ser refeito.

## Acceptance Criteria

- [ ] `prospectingRepository.createDeal` deixa de calcular `id` no codigo e passa
  a obter o id da sequencia do banco, mantendo a convencao atual de `contacts.id`
  e `deals.id` compartilharem o mesmo valor.
- [ ] Qualquer outro ponto que insira em `deals` ou `contacts` com id explicito e
  identificado e migrado para o mesmo mecanismo. O levantamento faz parte da
  entrega e fica registrado na story.
- [ ] Existe verificacao automatizada que compara `last_value` de
  `deals_id_seq` e `contacts_id_seq` contra `max(id)` das respectivas tabelas e
  falha quando a sequencia esta atras.
- [ ] Essa verificacao e exposta em comando CLI, coerente com CLI First, e pode
  rodar sob demanda apos qualquer importacao em massa.
- [ ] Se alguma carga precisar mesmo de id explicito por motivo justificado, ela
  passa a chamar `setval` ao final, e o motivo fica documentado no codigo.
- [ ] Migration e aditiva e nao altera nenhum id existente. Nenhum registro de
  `deals`, `contacts`, `activities` ou `quiz_leads` e reescrito ou apagado.
- [ ] Teste cobre o cenario de regressao: com a sequencia artificialmente atras
  do `max(id)`, a insercao via trigger de `quiz_leads` deve continuar funcionando
  ou falhar com erro explicito e diagnosticavel, nunca com 500 generico.
- [ ] Teste cobre a criacao de lead pelo quiz ponta a ponta: `quiz_leads` recebe
  o registro, o deal e criado com `stage=prospect` e `origin=quiz:{source}`,
  a activity entra na timeline e `materialized_deal_id` e preenchido.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Fora de escopo

- Reescrever o trigger `materialize_quiz_lead_deal`. Ele esta correto; o problema
  era a sequencia.
- Alterar a copy, o layout ou a segmentacao do quiz e do `resultado.html`, que
  vivem no repo `BKSErick/Linkbiopageerick`.
- Backfill ou reprocessamento de leads antigos. A tabela `quiz_leads` foi zerada
  em 12/08/2026 porque os 6 registros existentes eram todos de teste.
- Trocar o tipo da chave primaria (por exemplo para uuid) ou mexer no modelo de
  dados de `deals` e `contacts`.

## Notas tecnicas

- Sequencias envolvidas: `public.deals_id_seq`, `public.contacts_id_seq`.
- Consulta de diagnostico usada na investigacao:

  ```sql
  select 'deals' as tabela,
         (select max(id) from public.deals) as max_id,
         (select last_value from public.deals_id_seq) as seq
  union all
  select 'contacts',
         (select max(id) from public.contacts),
         (select last_value from public.contacts_id_seq);
  ```

- Correcao paliativa ja aplicada em producao:

  ```sql
  select setval('public.deals_id_seq', (select max(id) from public.deals)),
         setval('public.contacts_id_seq', (select max(id) from public.contacts));
  ```

- Ao aplicar SQL em producao, usar a Management API com dry-run em transacao com
  `ROLLBACK` antes do comando definitivo.

## Change Log

| Data | Versao | Descricao | Autor |
| --- | --- | --- | --- |
| 2026-08-12 | 1.0 | Story criada a partir da investigacao que encontrou a sequencia desalinhada derrubando todo envio do quiz | @aios-master |
