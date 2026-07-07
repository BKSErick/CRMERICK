# Story 011 - Melhoria de busca de leads e scripts Webson

## Status
Done

## Story
Como Erick, quero melhorar os criterios de busca, priorizacao e abordagem dos leads do Garimpo, para separar leads sem consciencia de compra dos leads com dor comercial clara e aumentar a taxa de resposta nas abordagens de paginas/sites.

## Contexto
Fonte: pesquisa operacional em `D:\01 -Arquivos\Obsidian\obsidian-mind\SaaS\CRM ERICK\Erick Sena`, CRM local `D:\001Gravity\CRM ERICK`, respostas do NotebookLM/Easy Builder e diretrizes do agente `webson-vendedor`.

Achados confirmados:
- O CRM possui 942 deals, com 868 prontos para disparo, 74 sem telefone, 0 sem copy e 0 sem auditoria.
- A base `js/garimpo-leads.json` contem sinais ricos (`rating`, `reviews_count`, `website`, `phone`, `address`), mas o fluxo operacional ainda prioriza muito por score/status bruto.
- Alguns leads sem site nao tem consciencia suficiente para comprar site; no industrial, a abordagem precisa vender validacao B2B, perda de orcamento e confianca antes de vender "site".
- No meio industrial, email/LinkedIn tendem a funcionar melhor para empresas estruturadas; WhatsApp fica melhor para dono/operacao local; Instagram e mais forte em B2C/local.

## Acceptance Criteria
- [x] Criar playbook versionado com queries de alta intencao por segmento e evento de dor.
- [x] Criar scoring local que considere consciencia, tipo de oportunidade, rating/reviews, canal e exclusoes.
- [x] Deduplicar leads antes de gerar o Top N de prioridade.
- [x] Marcar leads industriais que precisam de enriquecimento de e-mail/LinkedIn.
- [x] Designar Webson como dono dos scripts consultivos de abordagem e Dex/dev como executor tecnico da mudanca.
- [x] Salvar a pesquisa, scripts, decisoes e achados tecnicos no Obsidian.
- [x] Expor comando npm para rodar o playbook de busca.

## Tasks / Subtasks
- [x] Ler materiais do Obsidian sobre Erick, Garimpo, leads priorizados, auditorias locais e funil de captura.
- [x] Ler `webson-vendedor.md` e aplicar suas regras de venda consultiva.
- [x] Auditar prontidao de disparo com `node scripts/audit-disparo-readiness.js`.
- [x] Criar `scripts/lead-search-playbook.js`.
- [x] Ajustar o playbook para deduplicar leads e sinalizar enriquecimento de canal industrial.
- [x] Atualizar `package.json` com `leads:search-playbook`.
- [x] Rodar o novo playbook e validar saida.
- [x] Documentar no Obsidian.

## Dev Agent Record

### Agent Model Used
Codex GPT-5

### Debug Log References
- `node scripts/audit-disparo-readiness.js`
- `node scripts/lead-search-playbook.js --top=10`

### Completion Notes List
- Webson foi usado como dono dos scripts comerciais e criterios de mensagem.
- Dex/dev foi usado como executor tecnico para criar o playbook de scoring/busca.
- A mudanca e incremental: nao altera disparos existentes nem regrava `mock-db.js`.
- O primeiro teste revelou duplicatas no Top 10; o playbook foi corrigido para deduplicar antes da ordenacao.

### File List
- `scripts/lead-search-playbook.js`
- `package.json`
- `docs/stories/story-011-melhoria-busca-leads-webson.md`
- Obsidian: `SaaS/CRM ERICK/Erick Sena/Playbook_Busca_Leads_Webson_2026-07-07.md`

### Change Log
- 2026-07-07: Story criada e concluida com playbook de busca/scoring e documentacao operacional.
- 2026-07-07: Playbook ajustado com dedupe e flags de enriquecimento de e-mail/LinkedIn para industrial.
