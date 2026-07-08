# Story 017 - Scoring inteligente v2: consciencia real, builders e concorrencia

## Status
Ready for Dev

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
- [ ] REBALANCEAMENTO SEM_SITE: "sem site" deixa de ganhar bonus flat. Passa a valer pelo cruzamento com sinais de operacao viva: rating/reviews recentes, GMB preenchido (telefone, horario), presenca Instagram ativa. Sem site + sem sinais de vida = baixa consciencia, score penalizado (fila C). Sem site + operacao viva = oportunidade real (fila A).
- [ ] DETECCAO DE BUILDER ampliada: Wix (inclui wixsite/wixstatic), GoDaddy, Squarespace, Webnode, Jotform, Canva Sites, Duda, Google Sites, Loja Integrada, wordpress.com hospedado - por padrao de URL E, quando o HTML for coletavel, por fingerprint (meta generator, dominios de assets). Vira `opportunity: SITE_FRACO_BUILDER` com o builder identificado no dado.
- [ ] DETECCAO DE CONCORRENTE: quando o site foi feito por outra empresa (creditos no footer: "desenvolvido por", "criado por", "by {agencia}", link para agencia), marcar `competitor_built: true` + nome/link do fornecedor quando extraivel. Muda o angulo de abordagem (nunca criticar o site; regua = conteudo/visibilidade/resultado).
- [ ] QUALIDADE DE CONTEUDO/VISIBILIDADE (industrial): quando o HTML for coletavel, sinais simples e explicaveis: tem catalogo/especificacoes tecnicas? title/meta description presentes? menciona WhatsApp/email? https? mobile viewport? Compoe um `content_score` separado do priority_score (sem penalizar quem nao pode ser coletado).
- [ ] CANAL: industrial com email detectado prioriza canal email (needs_email_research ja existe; evoluir para email capturado quando disponivel no HTML); WhatsApp segue canal default. O canal recomendado sai no item da fila do dia.
- [ ] CONSCIENCIA v2: mapear cada lead para o nivel de jornada do framework Webson (desconhecido / consciente do problema / comparando / pronto) usando os sinais acima (ex.: builder fraco recente = consciente do problema; site de agencia = comparando/atendido). O campo alimenta a escolha de template de copy (framework Hormozi de abordagem, doc em producao no vault).
- [ ] SAIDA: cada lead da fila carrega `recommended_approach` (sem_site_ativo | builder_fraco | site_concorrente | site_auditar | industrial_email) para o CRM e a copy usarem. Fila do dia (story-016) consome o score v2.
- [ ] Coleta de HTML: best-effort com timeout curto, cache em disco (nao re-fetch a cada run), tolerante a falha (lead sem fetch mantem score baseline). Nunca bloquear a fila por causa de site fora do ar. Respeitar limite de execucao razoavel (ex.: só top N candidatos por run).
- [ ] CLI `npm run leads:search-playbook` continua funcionando (com novos campos) e a versao server-side (fila do dia) usa a mesma logica compartilhada. Lint + build passam. Smoke com amostra real dos leads no Dev Agent Record (mostrar 10 exemplos: score antigo vs novo + abordagem).

## Tasks / Subtasks
- [ ] Extrair a logica de scoring para modulo compartilhado (CLI + rota server-side da 016).
- [ ] Implementar sinais: operacao viva, builders, concorrente, conteudo/visibilidade, email.
- [ ] Rebalancear pesos com tabela documentada no codigo (explicavel, nao caixa-preta).
- [ ] Mapear consciencia Webson + recommended_approach.
- [ ] Cache de fetch em disco + rate limit.
- [ ] Comparativo antes/depois com 10 leads reais no Dev Agent Record.

## Dependencias
- story-016 (fila do dia) consome o resultado; implementar 016 primeiro (ou o modulo compartilhado junto).
- Framework de mensagem por abordagem (Hormozi) em producao no vault - o `recommended_approach` deve casar com os templates de la.

## Riscos
- Fetch de sites de terceiros: usar user-agent honesto, timeout 5-8s, sem retry agressivo; falha nunca derruba o run.
- Rebalancear score muda a fila: manter flag/coluna com score v1 por 1 ciclo para comparacao e rollback logico.
- Nao transformar heuristica em certeza: campos novos sao sinais declarados, exibidos com a origem ("detectado por footer credit").

## Dev Agent Record

### Agent Model Used
_A definir_

### Debug Log References
_A definir_

### Completion Notes List
_A definir_

### File List
_A definir_

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir das diretrizes do Erick (consciencia real vs sem-site, builders Wix-like, site de concorrente, canal email industrial, IAs Easy Builder/Webson).
