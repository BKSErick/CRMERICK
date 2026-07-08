# Story 019 - Quiz v2 do linkbio: reescrita Finch + publicacao (fecha a 008)

## Status
Ready for Review

## Story
Como Erick, quero o quiz do linkbio reescrito conforme a revisao do Finch e publicado, para que ele qualifique de verdade (segmento + gargalo + intencao), venda enquanto pergunta e alimente o pipeline do CRM automaticamente, fechando o loop captura -> Kanban.

## Contexto
- Fonte da reescrita: `D:\01 -Arquivos\Obsidian\obsidian-mind\SaaS\CRM ERICK\Posicionamento\Revisao_Quiz_Linkbio_Finch.md` (veredito: o quiz atual coleta mas nao qualifica; Q1-Q3 redundantes puxando "sim"; Q5 e pitch embutido que mata a confianca; score marca "critico" pra todo mundo).
- Esta story FECHA a story-008 (gate CONCERNS): o lado CRM esta pronto (tabela `quiz_leads` no Supabase unificado, trigger materializa deal prospect), mas o quiz vive fora do repo (`D:\tmp\Linkbiopageerick\quiz.html`) e nao foi publicado - o loop nao esta vivo em producao.
- Repo do linkbio: `BKSErick/Linkbiopageerick` (mesmo repo do pixel Meta 1175331711422463). Deploy proprio (Vercel).
- Relacionada: story-018 (CTA OStrack) - a tela de resultado do quiz ganha o CTA OStrack para gargalo de gestao de OS, com UTM propria (`utm_source=quiz`).
- PREFERENCIA DO ERICK (SDC): testar em localhost primeiro; CHECKPOINT com ele antes de qualquer deploy em producao.

## Acceptance Criteria
- [x] Quiz versionado DENTRO do repo do linkbio (nada de arquivo solto em D:\tmp). Se o repo nao estiver clonado localmente, clonar em local apropriado e documentar o caminho no Dev Agent Record.
- [x] Perguntas reescritas conforme a Revisao Finch (max 5-7): Q1 identifica segmento + gargalo primario numa pergunta so (alimenta `segment`, ex. industrial_b2b); perguntas intermediarias fazem o lead sentir o custo do problema (venda enquanto qualifica); Q5 vira pergunta de intencao ("o que voce quer resolver primeiro?") sem pitch embutido.
- [x] Payload do quiz gravando no `quiz_leads` do Supabase unificado do CRM (rezgkabwxxltpprpvdua) com os campos novos (segmento, gargalo_primario, intencao); se o schema precisar de coluna nova: migration ADITIVA via padrao do CRM, e o trigger de materializacao de deal continua funcionando (score/gargalo viram prioridade no Kanban como na story-008).
- [x] Tela de resultado personalizada pela intencao/gargalo declarados: resultado especifico (nao generico), CTA primario WhatsApp com contexto pre-preenchido, e CTA secundario OStrack (`https://o-strackpagina.vercel.app/` + `utm_source=quiz&utm_medium=cta&utm_campaign=linkbio`) APENAS quando o gargalo for gestao de OS/industrial (sem canibalizar o CTA primario).
- [x] Instrumentacao de drop-off: evento de pixel por pergunta respondida (start, q1..qN, complete) para medir completion rate por etapa, no padrao dos eventos existentes.
- [x] Sem segredo client-side novo; insert em quiz_leads segue o padrao ja aprovado (insert-only anon com RLS correta, como esta hoje).
- [x] Teste em localhost do fluxo completo: responder quiz -> linha em quiz_leads -> deal prospect aparece no Kanban do CRM (evidencia no Dev Agent Record).
- [x] CHECKPOINT: NAO fazer deploy em producao nesta story sem OK explicito do Erick. Deixar tudo pronto (commit local no repo do linkbio, sem push) e listar no Dev Agent Record o passo exato de publicacao.

## Tasks / Subtasks
- [x] Localizar/clonar o repo do linkbio e trazer o quiz atual pra dentro (baseline commitada antes da reescrita).
- [x] Reescrever perguntas + logica de score/gargalo/segmento/intencao conforme o doc do Finch.
- [x] Ajustar payload/endpoint para o Supabase unificado (+ migration aditiva se necessario, validando o trigger da 008).
- [x] Tela de resultado personalizada + CTA WhatsApp contextualizado + CTA OStrack condicional.
- [x] Eventos de pixel por etapa (drop-off).
- [x] Teste localhost end-to-end (quiz -> quiz_leads -> deal no Kanban) com evidencia.
- [ ] Atualizar story-008: apos o deploy aprovado pelo Erick e um lead de teste real em producao, a 008 sai de CONCERNS (registrar no Change Log dela). _Bloqueado corretamente pelo checkpoint/deploy de producao; nao executado nesta passada._

## Dependencias
- story-008 (lado CRM pronto): esta story e o fechamento dela.
- story-018 (CTA OStrack no diagnostico): mesma URL/UTM pattern, implementacoes independentes.
- Deploy em producao: BLOQUEADO por checkpoint do Erick (AC final).

## Riscos
- Repo do linkbio e projeto de producao separado (pixel/paginas ao vivo): mexer somente no quiz e assets dele; nada de refactor fora do escopo.
- Mudar payload pode quebrar o trigger da 008: validar com insert de teste antes de considerar pronto.
- Mudar perguntas zera comparabilidade do score antigo: aceitavel (score antigo nao discriminava mesmo, conforme Finch).

## Dev Agent Record

### Agent Model Used
GPT-5 Codex (Dex/dev)

### Debug Log References
- Repo linkbio localizado em `D:\tmp\Linkbiopageerick`; baseline limpo em `main...origin/main`, commit base `da3d384 Point quiz leads to CRM endpoint`.
- Commit local criado no linkbio sem push: `01480ff feat: rework linkbio quiz v2`; repo ficou `main...origin/main [ahead 1]`.
- `node scripts\verify-quiz-v2.js` - RED inicial falhou por ausencia da pergunta Finch v2; GREEN final passou.
- Checagem sintatica dos scripts inline de `quiz.html` e `resultado.html` com `new Function(...)` - passou para 2 scripts em cada arquivo.
- `node scripts\apply-migration.mjs scripts\migrations\20260708_quiz_leads_v2_fields.sql` - migration aplicada no Supabase, HTTP 201.
- `node scripts\smoke-quiz-leads.js` - passou; deal `prospect`, `points` 9, `prob` 87, `segment` os_management.
- Teste localhost temporario na porta 3020: POST em `http://127.0.0.1:3020/api/quiz-leads` retornou HTTP 201, `quizLeadId=1b6cde20-f54a-4054-a46c-aa628f6e36af`, deal `prospect`; dado de smoke limpo em seguida.
- `npm.cmd run lint` - passou.
- `npx.cmd tsc --noEmit` - passou.
- `npm.cmd run build` - passou.
- `npm.cmd test` - falhou porque nao existe script `test` no `package.json`.

### Completion Notes List
- Quiz v2 reescrito em `D:\tmp\Linkbiopageerick` com 5 perguntas Finch: gargalo/segmento, custo da dor, porte da equipe, faturamento e intencao.
- Payload v2 envia `segment`, `gargalo_primario`, `intencao`, `dor_score`, `equipe_porte`, `faturamento`, `score` e `gargalo`; endpoint permite override local via `window.CRM_QUIZ_ENDPOINT` sem expor segredo.
- Resultado personalizado por gargalo/intencao com WhatsApp contextualizado; CTA OStrack aparece apenas para `os_management`, `industrial_b2b` ou `controle_os`, com UTM `utm_source=quiz&utm_medium=cta&utm_campaign=linkbio`.
- Drop-off instrumentado com `QuizStart`, `QuizStep`, `QuizComplete` e `OStrackCTAClick`.
- Migration aditiva aplicada; trigger da story-008 validado por smoke e localhost.
- Deploy em producao NAO realizado. Passo exato de publicacao apos OK do Erick: no repo `D:\tmp\Linkbiopageerick`, revisar commit `01480ff`, push para `origin/main`/Vercel; depois responder quiz real em producao, validar deal no CRM e atualizar story-008.

### File List
- `D:\tmp\Linkbiopageerick\quiz.html`
- `D:\tmp\Linkbiopageerick\resultado.html`
- `D:\tmp\Linkbiopageerick\scripts\verify-quiz-v2.js`
- `scripts/migrations/20260708_quiz_leads_v2_fields.sql`
- `scripts/smoke-quiz-leads.js`
- `scripts/supabase-schema.sql`
- `src/app/api/quiz-leads/route.ts`

## Change Log
- 2026-07-08: Story criada por Orion (aios-master) a pedido do Erick ("pode colocar o story do quiz na fila tambem"), consolidando a Revisao_Quiz_Linkbio_Finch + fechamento da story-008.
- 2026-07-08: Implementada por Dex/dev; quiz v2 pronto no repo linkbio, migration v2 aplicada, smoke/localhost validados e deploy bloqueado aguardando checkpoint do Erick. Status Ready for Review.

## QA Results

### Review Date: 2026-07-08
### Reviewed By: Quinn (QA)
### Gate Decision: CONCERNS

#### Evidence
- `node scripts\verify-quiz-v2.js` passou no repo `D:\tmp\Linkbiopageerick`.
- Parse sintatico dos scripts inline de `quiz.html` e `resultado.html` passou.
- `node scripts\apply-migration.mjs scripts\migrations\20260708_quiz_leads_v2_fields.sql` aplicado no Supabase, HTTP 201.
- `node scripts\smoke-quiz-leads.js` passou; materializacao `quiz_leads -> deals` preservada.
- Teste local temporario em `http://127.0.0.1:3020/api/quiz-leads` retornou HTTP 201 e deal `prospect`; dado de smoke limpo.
- `npm.cmd run lint`, `npx.cmd tsc --noEmit` e `npm.cmd run build` passaram no CRM.
- `npm.cmd test` nao executa por ausencia de script `test` no `package.json`.
- CodeRabbit nao executado: WSL nao esta configurado neste ambiente.

#### Concerns
- Deploy em producao nao foi executado por requisito de checkpoint do Erick.
- Story-008 ainda nao deve sair de CONCERNS ate lead real em producao apos publicacao aprovada.

#### Notes
- Repo linkbio ficou com commit local `01480ff` e sem push, conforme bloqueio da story.
