# Story 017 - Scoring inteligente v2: consciencia real, builders e concorrencia

## Status
Done

## Story
Como Erick, quero o sistema de busca e scoring dos leads muito mais inteligente, para que a fila do dia traga empresas com consciencia real de compra e a abordagem certa por perfil, em vez de gastar meu esforco com "sem site" que nunca vai comprar.

## Contexto
Diretrizes do Erick (07/07/2026):
- "Sem site" no Google NAO reflete automaticamente nivel de consciencia suficiente pra comprar; gera esforco em excesso. Hoje `scripts/lead-search-playbook.js:151` da +16 flat por nao ter site (so ha um -15 fraco quando reviews=0).
- Sites feitos em criadores tipo Wix: na area industrial nao e so beleza; conteudo e visibilidade importam. Hoje a deteccao de builder (linha 137) so cobre jotform/webnode/sites.google.
- "Outra empresa montou o site" = competimos com o fornecedor atual; a regua e outra (conteudo/visibilidade, nao estetica).
- Industrial responde muito email/WhatsApp; canal deve pesar.
- As IAs clonadas do Easy Builder ajudam: estados mentais do Webson Vendedor (confusao, curiosidade, comparacao, desconfianca, medo, validacao final) e niveis de jornada (desconhecido, consciente do problema, comparando, pronto). Referencia: `D:\01 -Arquivos\Obsidian\obsidian-mind\thinking\easy_builder_knowledge_base.md` e agente webson-vendedor ja calibrado (story-011).

## Acceptance Criteria
- [x] REBALANCEAMENTO SEM_SITE: fim do bonus flat +16. Agora `SEM_SITE` vale por sinais de operacao viva (rating>=4.0, reviews>=3, telefone, GMB/endereco, Instagram): >=2 sinais +14 (fila A), 1 sinal +4, 0 sinal -12 (fila C). Verificado: lead vivo subiu (ex.: 37->60) e lead morto caiu (Vetor Metalurgica 14->2).
- [x] DETECCAO DE BUILDER ampliada: Wix (wixsite/wixstatic), GoDaddy, Squarespace, Webnode, Jotform, Canva Sites, Duda, Google Sites, Loja Integrada, wordpress.com - por padrao de URL (sync) E por fingerprint de HTML (meta generator + dominios de assets) no enrich. Vira `opportunity: SITE_FRACO_BUILDER` com o builder no dado (`builder`, `builder_source`).
- [x] DETECCAO DE CONCORRENTE: creditos no footer ("desenvolvido por", "criado por", "site by", "powered by") marcam `competitor_built: true` + `competitor_provider`/`competitor_link` (ignora auto-credito de plataforma e links de social). Muda approach para `site_concorrente` (regua = visibilidade/resultado, nunca design).
- [x] QUALIDADE DE CONTEUDO/VISIBILIDADE: `content_score` (0-7) a partir do HTML: title, meta description, catalogo/especificacao, WhatsApp/email, https, viewport mobile. SEPARADO do priority_score (nao penaliza quem nao pode ser coletado).
- [x] CANAL: industrial_b2b com email prioriza `email`; caso contrario WhatsApp/LinkedIn. Email capturado do HTML quando disponivel (extractEmail). O canal sai no item da fila do dia.
- [x] CONSCIENCIA v2: nivel Webson (desconhecido / consciente / comparando / pronto): builder fraco = consciente; site de concorrente/auditar = comparando; sem-site vivo = consciente, morto = desconhecido; `pronto` reservado para quem respondeu.
- [x] SAIDA: cada lead carrega `recommended_approach` (sem_site_ativo | builder_fraco | site_concorrente | site_auditar | industrial_email), casando com os templates A-E do Framework Hormozi. Fila do dia (story-016) consome via `/api/comando` (coluna "Abordagem").
- [x] Coleta de HTML: best-effort, timeout 7s (AbortController), cache em disco (.cache/lead-html, TTL 7d, gitignored), try/catch total - falha volta null e mantem baseline. So top N por run (`--enrich-limit`, default 40). Nunca bloqueia a fila (a fila server-side usa scoring sync, sem fetch).
- [x] CLI `npm run leads:search-playbook` continua funcionando (novos campos + flags --enrich/--compare) e a fila server-side usa a MESMA logica (`src/lib/leadScoring.js`). Lint + build passam. Comparativo de 10 leads no Dev Agent Record.

## Tasks / Subtasks
- [x] Modulo compartilhado `src/lib/leadScoring.js` (+ `.d.ts`) usado pelo CLI e pela rota `/api/comando`.
- [x] Sinais implementados: operacao viva, builders (URL + fingerprint HTML), concorrente (footer), content_score, email.
- [x] Pesos rebalanceados com TABELA documentada no cabecalho do modulo (explicavel).
- [x] Consciencia Webson + recommended_approach (5 perfis casando com o Framework Hormozi).
- [x] Cache de fetch em disco (.cache, TTL 7d) + timeout + limite top N por run.
- [x] Comparativo v1 vs v2 (10 leads reais) no Dev Agent Record.

## Dependencias
- story-016 (fila do dia) consome o resultado; implementar 016 primeiro (ou o modulo compartilhado junto).
- Framework de mensagem por abordagem (Hormozi) em producao no vault - o `recommended_approach` deve casar com os templates de la.

## Riscos
- Fetch de sites de terceiros: usar user-agent honesto, timeout 5-8s, sem retry agressivo; falha nunca derruba o run.
- Rebalancear score muda a fila: manter flag/coluna com score v1 por 1 ciclo para comparacao e rollback logico.
- Nao transformar heuristica em certeza: campos novos sao sinais declarados, exibidos com a origem ("detectado por footer credit").

## Dev Agent Record

### Agent Model Used
Dex via Claude

### Debug Log References
- `npm run lint`: PASS. `npm run build`: PASS (`/api/comando` recompila com o scoring v2; leadScoring importado com tipos via leadScoring.d.ts).
- CLI: `node scripts/lead-search-playbook.js --compare=10` roda offline (sem fetch) sobre 963 leads unicos reais (legacy/js/garimpo-leads.json).
- Teste unitario das funcoes de HTML (sintetico, sem rede): builder=Wix (fingerprint), competitor_built=true provider="Agencia Alfa Digital", content_score=5/7, email extraido, approach=site_concorrente.

### Completion Notes List
- Arquitetura: `src/lib/leadScoring.js` (CommonJS PURO, sync, pesos documentados) + `src/lib/leadScoring.d.ts` (tipos). Consumido pelo CLI (require) E pela rota server-side `/api/comando` (import com tipos). O enrich por HTML (fetch/cache/fingerprint) fica em `scripts/lib/leadEnrich.js` (CLI-only, fora do bundle Next e do lint TS).
- Rebalance SEM_SITE por operacao viva (fim do +16 flat). Consciencia v2 (Webson) e `recommended_approach` (5 perfis) casando com os templates A-E do `Framework_Mensagem_Abordagem_Hormozi.md`.
- Fila do dia (016) agora carrega `recommended_approach` + `channel` por lead (coluna "Abordagem" no Comando), computados com a mesma logica compartilhada (scoring sync, sem fetch - a fila nunca depende de site externo).
- Enrich best-effort: timeout 7s, cache em disco `.cache/lead-html` (TTL 7d, gitignored), try/catch total, so top N por run. `priority_score_v1` preservado ao lado do v2 para comparacao/rollback logico.
- CLI: `npm run leads:search-playbook` continua funcionando; novas flags `--enrich [--enrich-limit=N]`, `--compare=N`, `--json`. Tolerante a `garimpo-leads.json` ausente (fallback dev legacy/js/; sem crash).

### Comparativo v1 vs v2 (amostra real - 963 leads unicos)
Maiores ALTAS (industrial vivo sem site, antes subvalorizado):
| lead | v1 | v2 | delta | opportunity | live | consciencia | approach |
|---|---|---|---|---|---|---|---|
| Manutencao y Electro | 19 | 42 | +23 | SEM_SITE | 2 | consciente | sem_site_ativo |
| Ajamec solucao industrial | 19 | 42 | +23 | SEM_SITE | 2 | consciente | sem_site_ativo |
| Star Usinagem Abc | 37 | 60 | +23 | SEM_SITE | 2 | consciente | sem_site_ativo |
| Extrema Manutencao Industrial | 37 | 60 | +23 | SEM_SITE | 2 | consciente | sem_site_ativo |

Maiores QUEDAS (sem-site sem sinal de vida, rebaixado p/ fila C):
| lead | v1 | v2 | delta | opportunity | live | consciencia |
|---|---|---|---|---|---|---|
| Vetor Metalurgica | 14 | 2 | -12 | SEM_SITE | 1 | desconhecido |

Distribuicao (963 leads): approach = 599 site_auditar, 357 sem_site_ativo, 7 builder_fraco (URL; mais surgem com --enrich). Consciencia = 599 comparando, 353 consciente, 11 desconhecido.
Nota: deteccao de builder por fingerprint HTML e competitor/content_score dependem de `--enrich` (coleta best-effort); a fila server-side usa os sinais sincronos (URL + operacao viva).

### File List
Criados:
- `src/lib/leadScoring.js`
- `src/lib/leadScoring.d.ts`
- `scripts/lib/leadEnrich.js`
Modificados:
- `scripts/lead-search-playbook.js` (usa modulo compartilhado + flags --enrich/--compare)
- `src/app/api/comando/route.ts` (fila carrega recommended_approach/channel via scoring v2)
- `src/app/comando/page.tsx` (coluna "Abordagem" na fila)
- `.gitignore` (`.cache/`)

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir das diretrizes do Erick (consciencia real vs sem-site, builders Wix-like, site de concorrente, canal email industrial, IAs Easy Builder/Webson).
- 2026-07-08: Dex (@dev) implementou o scoring v2 compartilhado (CLI + fila server-side), rebalance sem-site por operacao viva, deteccao de builder/concorrente/content_score/email, consciencia Webson e recommended_approach (5 perfis Hormozi). Lint + build PASS, comparativo de leads reais. Status -> Ready for Review.
- 2026-07-08: [QA - Quinn] Review completa + gate PASS. Status -> Done.

## QA Results

### Gate: PASS (2026-07-08, Quinn/Guardian)

**Verificacoes de AC:**
- Modulo compartilhado `src/lib/leadScoring.js` (CommonJS puro, sync, sem fetch) + `.d.ts`, consumido pelo CLI (require) E pela rota /api/comando (import). Enrich por HTML (fetch/cache/fingerprint) isolado em `scripts/lib/leadEnrich.js` (CLI-only, fora do bundle Next). CONFIRMADO.
- Rebalance SEM_SITE por operacao viva: fim do +16 flat. Agora >=2 sinais +14, 1 sinal +4, 0 sinal -12 (fila C). Sinais: rating>=4.0, reviews>=3, phone, address/GMB, instagram. CONFIRMADO no scoreV2.
- Deteccao builder ampliada (Wix/GoDaddy/Squarespace/Webnode/Jotform/Canva/Duda/Google Sites/Loja Integrada/WordPress.com) por URL (sync) + fingerprint HTML (enrich). Concorrente via footer credit -> approach `site_concorrente`. content_score (0-7) SEPARADO do priority_score. Canal industrial_b2b prioriza email. CONFIRMADO.
- Consciencia Webson v2 (desconhecido/consciente/comparando/pronto) e `recommended_approach` (5 perfis: sem_site_ativo, builder_fraco, site_concorrente, site_auditar, industrial_email) casando com os templates A-E do Framework Hormozi. `pronto` reservado para quem respondeu. CONFIRMADO.
- `priority_score_v1` preservado ao lado do v2 (rollback logico). Fila server-side usa scoring SYNC (nunca depende de rede externa). CONFIRMADO.

**Empirico:** `npm run lint` PASS; `npm run build` PASS (/api/comando recompila com scoring v2). CLI `node scripts/lead-search-playbook.js --compare=10` roda OFFLINE sobre os leads reais: top-10 industrial vivo sem-site sobe v1->v2 (ex.: USINAGEM ALMEIDA 84->92), consciencia=consciente, approach=sem_site_ativo, canal=whatsapp. Direcao do rebalance confirmada.

**Notas (nao bloqueiam):** builder por fingerprint/competitor/content_score dependem de `--enrich` (best-effort, top N por run); a fila server-side usa os sinais sincronos (URL + operacao viva), como declarado. Pesos documentados no cabecalho do modulo (explicavel, nao caixa-preta).
