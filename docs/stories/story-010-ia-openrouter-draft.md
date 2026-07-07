# Story 010 - IA no CRM via OpenRouter (draft)

## Status
Draft - aguardando priorizacao

## Story
Como Erick, quero gerar e regenerar copy de disparo por lead e resumos de deal usando IA real dentro do CRM, para parar de depender de template/regex fixo e ter texto mais relevante por contato.

## Contexto
Fonte: `Pre-Vistoria_CRM_2026-07-07.md`, secoes 7, 8 (Fase 4 / backlog) e 10 (decisoes do Erick).

Hoje `scripts/regenerate-copies.js` gera copy por template/regex, nao por LLM. O Erick ja roda o padrao OpenRouter (modelos free com fallback em cadeia, key em variavel de ambiente) em outros projetos (OStrack, Garimpo). Por decisao do Erick, esta funcionalidade entra "em breve": sobe do backlog para o fim do ciclo atual, mas fica como draft menos detalhado ate ser priorizada de fato. Depende da persistencia real (Story 007) estar no ar, ja que IA vai operar sobre deals/contacts reais, nao mock.

## Acceptance Criteria (nivel draft, sujeito a refinamento antes do desenvolvimento)
- [ ] Existe uma rota server-side `/api/ai` que chama a API do OpenRouter, com a key lida apenas de `process.env`.
- [ ] A rota usa uma cadeia de fallback entre modelos free (mesmo padrao ja usado em OStrack/Garimpo), com tratamento de erro quando todos os modelos da cadeia falharem.
- [ ] Primeiro caso de uso: gerar/regenerar `copyText` de um deal (substituindo ou complementando `scripts/regenerate-copies.js`) usando dados reais do deal/contact vindos do Supabase (Story 007).
- [ ] Segundo caso de uso: gerar um resumo curto de um deal (contexto, estagio, proximo passo sugerido) a partir dos dados existentes.
- [ ] A tela de Disparo (ou Pipeline) ganha um ponto de entrada para acionar a geracao/regeneracao de copy via IA, com estado de loading e erro visivel.
- [ ] Nenhuma chave de API do OpenRouter e exposta no cliente.

## Tasks / Subtasks (alto nivel, a detalhar quando priorizada)
- [ ] Confirmar com o Erick qual modelo/cadeia de fallback usar (reaproveitar config de OStrack/Garimpo ou definir especifica para o CRM).
- [ ] Criar `/api/ai/route.ts` server-side com chamada OpenRouter e fallback em cadeia.
- [ ] Integrar geracao de copy de disparo por deal.
- [ ] Integrar resumo de deal.
- [ ] Adicionar ponto de entrada na UI (Disparo/Pipeline) para acionar IA.
- [ ] Validar custo/rate limit dos modelos free escolhidos.
- [ ] Rodar `npm run lint` e `npm run build`.

## Dependencias
- Depende da Story 007 (persistencia real): IA precisa operar sobre deals/contacts reais do Supabase, nao sobre `mock-db.js`.
- Sem dependencia direta das Stories 006, 008 ou 009, mas faz mais sentido ser a ultima do ciclo por ser a de menor urgencia (decisao do Erick: "entra em breve", nao agora).

## Riscos
- Modelos free do OpenRouter tem rate limits e podem ficar indisponiveis; a cadeia de fallback precisa ser resiliente (mesmo padrao ja validado em OStrack).
- Sem escopo fechado ainda (story em nivel de draft); os criterios de aceite acima devem ser revisados e detalhados antes de entrar em desenvolvimento.
- ClickUp permanece fora do escopo do CRM por decisao do Erick; esta story nao deve criar nenhuma integracao com ClickUp.

## Dev Agent Record

### Agent Model Used
_A definir_

### Debug Log References
_A definir_

### Completion Notes List
_A definir_

### File List
_A definir_

### Change Log
- 2026-07-07: Story criada por River (SM) em nivel de draft, a partir do relatorio de pre-vistoria de 2026-07-07. Aguardando priorizacao do Erick antes de detalhar mais.
- 2026-07-07: Revisada por Pax (PO). Escopo coerente com a decisao do Erick (IA "entra em breve", ClickUp fora), dep em 007 correta. Mantida como Draft aguardando priorizacao por decisao do dono; AC devem ser refinados antes de virar Ready for Dev.
