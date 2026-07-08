# Story 010 - IA no CRM via OpenRouter (draft)

## Status
Ready for Review

## Story
Como Erick, quero gerar e regenerar copy de disparo por lead e resumos de deal usando IA real dentro do CRM, para parar de depender de template/regex fixo e ter texto mais relevante por contato.

## Contexto
Fonte: `Pre-Vistoria_CRM_2026-07-07.md`, secoes 7, 8 (Fase 4 / backlog) e 10 (decisoes do Erick).

Hoje `scripts/regenerate-copies.js` gera copy por template/regex, nao por LLM. O Erick ja roda o padrao OpenRouter (modelos free com fallback em cadeia, key em variavel de ambiente) em outros projetos (OStrack, Garimpo). Por decisao do Erick, esta funcionalidade entra "em breve": sobe do backlog para o fim do ciclo atual, mas fica como draft menos detalhado ate ser priorizada de fato. Depende da persistencia real (Story 007) estar no ar, ja que IA vai operar sobre deals/contacts reais, nao mock.

## Acceptance Criteria (nivel draft, sujeito a refinamento antes do desenvolvimento)
- [x] Existe uma rota server-side `/api/ai` que chama a API do OpenRouter, com a key lida apenas de `process.env`. (verificado no QA das 012/013)
- [x] A rota usa uma cadeia de fallback entre modelos free (OpenRouter 3 modelos -> Groq 2), com tratamento de erro (HTTP 502) quando todos falham. (QA)
- [x] Primeiro caso de uso: gerar/regenerar `copyText` de um deal usando dados reais do deal/contact do Supabase (Story 007). (QA)
- [x] Segundo caso de uso: gerar um resumo curto de um deal (contexto, estagio, proximo passo). (QA)
- [x] A tela de Pipeline tem ponto de entrada para acionar geracao/regeneracao de copy e resumo via IA, com loading e erro visivel. (botoes reabilitados nesta story apos QA PASS)
- [x] Nenhuma chave de API do OpenRouter e exposta no cliente (runtime nodejs, process.env). (QA)

## Tasks / Subtasks (alto nivel, a detalhar quando priorizada)
- [x] Cadeia de fallback definida: OpenRouter (gemini-2.5-flash / llama-3-8b / qwen-2-7b, free) -> Groq (llama-3.3-70b / llama-3.1-8b).
- [x] Criar `/api/ai/route.ts` server-side com chamada OpenRouter e fallback em cadeia.
- [x] Integrar geracao de copy de disparo por deal (writeback de copy_text).
- [x] Integrar resumo de deal.
- [x] Adicionar ponto de entrada na UI (Pipeline) para acionar IA (botoes reabilitados).
- [x] Rate limit tratado pela cadeia de fallback (429/5xx pulam para o proximo modelo).
- [x] Rodar `npm run lint` e `npm run build`.

## Dependencias
- Depende da Story 007 (persistencia real): IA precisa operar sobre deals/contacts reais do Supabase, nao sobre `mock-db.js`.
- Sem dependencia direta das Stories 006, 008 ou 009, mas faz mais sentido ser a ultima do ciclo por ser a de menor urgencia (decisao do Erick: "entra em breve", nao agora).

## Riscos
- Modelos free do OpenRouter tem rate limits e podem ficar indisponiveis; a cadeia de fallback precisa ser resiliente (mesmo padrao ja validado em OStrack).
- Sem escopo fechado ainda (story em nivel de draft); os criterios de aceite acima devem ser revisados e detalhados antes de entrar em desenvolvimento.
- ClickUp permanece fora do escopo do CRM por decisao do Erick; esta story nao deve criar nenhuma integracao com ClickUp.

## Dev Agent Record

### Agent Model Used
Dex via Claude

### Debug Log References
- `npm run lint`: PASS. `npm run build`: PASS (pipeline recompila com os handlers de IA; `/api/ai` dinamica).
- Verificacao: os botoes "Gerar com IA"/"Recalcular" (resumo) e "Gerar com IA"/"Regenerar IA" (copy) voltaram a chamar `/api/ai` com loading + erro visivel.

### Completion Notes List
- Fechamento do bonus do ciclo: a rota `/api/ai` ja existia e passou no QA (5/6 AC). Esta story so faltava o AC5 (ponto de entrada na UI), que a story-013 havia desabilitado ("Em breve") sob a premissa - depois superada - de que a rota nao existia.
- Reabilitados no modal do Pipeline os dois botoes de IA: `handleGenerateCopy` (writeback de copy_text via /api/ai) e `handleGenerateSummary` (resumo em markdown), com estados de loading e erro visivel. Botao "Copiar" e textarea de copy real permanecem.
- Nenhuma mudanca na rota `/api/ai` (ja aprovada no QA); apenas religacao da UI.

### File List
Modificados:
- `src/app/pipeline/page.tsx` (reabilitados os handlers e botoes de IA no modal do deal)

### Change Log
- 2026-07-07: Story criada por River (SM) em nivel de draft, a partir do relatorio de pre-vistoria de 2026-07-07. Aguardando priorizacao do Erick antes de detalhar mais.
- 2026-07-07: Revisada por Pax (PO). Escopo coerente com a decisao do Erick (IA "entra em breve", ClickUp fora), dep em 007 correta. Mantida como Draft aguardando priorizacao por decisao do dono; AC devem ser refinados antes de virar Ready for Dev.
- 2026-07-07: [QA - Quinn] Evidencia colhida durante a review das stories 012/013: a rota `src/app/api/ai/route.ts` JA EXISTE e esta funcional. Cross-check contra os AC deste draft: AC1 (rota server-side, key so de process.env) OK; AC2 (fallback OpenRouter 3 modelos free -> Groq 2 modelos, com erro tratado quando todos falham -> HTTP 502) OK; AC3 (generate-copy com writeback de copy_text no deal usando dados reais do Supabase) OK; AC4 (generate-summary de deal) OK; AC6 (nenhuma key exposta no cliente - runtime nodejs, process.env) OK. Falta apenas o AC5 (ponto de entrada na UI com loading/erro): os botoes existem no Pipeline mas foram DESABILITADOS ("Em breve") pela story-013 e os handlers `handleGenerateCopy`/`handleGenerateSummary` estao no historico do git. Conclusao: story materialmente implementada (5/6 AC). STATUS NAO ALTERADO por decisao do fluxo (segue Draft). Recomendacao ao Erick/coordenador: formalizar o fechamento e reabilitar o ponto de entrada na UI (reintroduzir os handlers do git) para cumprir o AC5. Nota advisory de QA; nenhuma outra secao desta story foi modificada.
