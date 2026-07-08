# Story 016 - Comando: cockpit de cobranca diaria de inputs

## Status
Ready for Review

## Story
Como Erick, quero abrir a aba Comando e ser COBRADO pelo sistema: os inputs do dia (disparos, follow-ups, calls), quanto ja fiz, quanto falta, e a fila priorizada de quem abordar agora, para que o CRM funcione como gestor que nao me deixa fugir da meta.

## Contexto
Decisao do Erick (07/07/2026): "ter o meu proprio sistema me cobrando todos os dias e maravilhoso". Base conceitual: `Posicionamento/Parecer_Tallis_Execucao_Cadencia.md` (gestao por inputs):
- Inputs diarios: 30 disparos/dia (fila selecionada por scoring, nao manual), 10 follow-ups/dia, inbox zerado, 4 calls/semana (a partir da semana 3), 3 posts Instagram/semana.
- Regra dos 7 dias: 210 disparos sem 1 call agendada = script morto.
- Regra do dia 20: menos de 40% da meta = dobrar volume, nao esticar prazo.

Estado tecnico:
- `activities` registra `stage_change` ao mover card (story-013). Comando e scaffold vazio React nativo (story-012).
- Scoring de prioridade existe em `scripts/lead-search-playbook.js` (npm run leads:search-playbook) - le `js/garimpo-leads.json` e calcula priority_score/consciousness/channel.
- Disparo: botoes wa.me nas telas de disparo/pipeline - hoje o clique NAO e registrado (nao ha contagem de disparos).

## Acceptance Criteria
- [x] Clique em "Enviar WhatsApp" (disparo e pipeline) registra atividade real (`activities`, tipo `whatsapp_sent`) via rota server-side (`/api/activities` POST, helper `logWhatsappSent`): disparos/dia passam a ser MEDIDOS automaticamente.
- [x] Aba Comando exibe o placar do dia com dados reais (`/api/comando`): disparos hoje vs meta (30, com split 20 LP + 10 DFY exibido), follow-ups hoje vs meta (10), calls da semana vs meta (4), deals movidos hoje. Metas de input em `content/goals.json`.
- [x] Fila do dia: proximos ~30 leads a abordar ordenados por prioridade reusando o score `points` ja persistido (nao inventa score novo), cada item com botao WhatsApp que registra o disparo e atualiza o placar.
- [x] Alertas de regra (sem drama): regra dos 7 dias (disparos 7d acumulados sem call/entrada em Qualified) e regra do dia 20 (percentual da meta do mes, via agregacao da story-014).
- [x] Sem dado fabricado: contadores em zero real + estados vazios quando nao houver eventos. Agregacao server-side (service-role); nada client-side com credencial.
- [x] `npm run build` e `npm run lint` passam; estados com e sem dados renderizam (placar zera real, fila vazia elegante).

## Tasks / Subtasks
- [x] `/api/activities` ja aceita `whatsapp_sent` (POST generico); rota dedicada `/api/comando` agrega contagens por dia/semana/7 dias.
- [x] Registro no clique dos botoes wa.me (disparo e pipeline) via helper `logWhatsappSent` (best-effort, nao bloqueia o disparo).
- [x] Config de metas de input (30/10/4 + split 20/10) em `content/goals.json`.
- [x] Fila do dia server-side reusando o score `points` dos deals ativos com telefone (top N = meta de disparos).
- [x] UI do Comando: placar do dia, fila do dia (com WhatsApp), alertas das regras 7-dias e dia-20.
- [x] Build + lint + verificacao dos estados.

## Dependencias
- story-013 (activities): concluida. story-014 (agregacao da meta): necessaria para o alerta do dia 20 - implementar 014 antes ou junto. story-015 (Lab) complementa mas nao bloqueia.

## Riscos
- Follow-up ainda nao tem gesto natural na UI alem do wa.me em deal ja contatado; comecar contando reenvio de WhatsApp para deal com disparo previo como follow-up (heuristica declarada na UI) e evoluir depois.
- Meta de calls depende de registrar call: usar mudanca de stage para "call/diagnostico" como proxy (stage real do Kanban a mapear pelo dev).
- Nao virar spam: fila limitada ao teto configurado (30), nunca disparo em massa automatico (decisao do Erick: WhatsApp manual).

## Dev Agent Record

### Agent Model Used
Dex via Claude

### Debug Log References
- `npm run lint`: PASS, zero warnings.
- `npm run build`: PASS. `/api/comando` dinamica (f); `/comando`, `/disparo`, `/pipeline` prerenderizados; TypeScript OK.
- Sem migration nova: reusa a tabela `activities` (story-013) para `whatsapp_sent`.

### Completion Notes List
- Registro automatico de disparo: helper client `src/lib/activityClient.ts` (`logWhatsappSent`) ligado no onClick dos botoes wa.me do Disparo e do modal do Pipeline; grava `activities.type = whatsapp_sent` via `/api/activities` (server-side, best-effort). O link wa.me abre normalmente mesmo se o log falhar.
- Rota `/api/comando`: placar do dia (disparos hoje/meta com split LP/DFY, follow-ups hoje/meta, calls da semana/meta, deals movidos hoje), fila do dia e alertas. Tudo server-side (service-role) a partir de `activities` + `deals`.
- Follow-up (heuristica declarada na UI): disparo de hoje para um deal que ja tinha `whatsapp_sent` anterior conta como follow-up.
- Calls (proxy declarado): entrada em stage "qualified" (via `stage_change` em activities) conta como call na semana.
- Fila do dia: deals ativos (prospect/qualified) com telefone, ordenados pelo `points` ja persistido (nao inventa score), teto = meta de disparos (30). Cada item com WhatsApp que registra o disparo e atualiza o placar (reload).
- Alertas: regra dos 7 dias (disparos 7d >= 210 sem nenhuma call/entrada em Qualified) e regra do dia 20 (dia >= 20 e meta do mes < 40%, usando `computeNorthStar`). Exibidos sem drama, com os numeros reais.
- Zero dado fabricado: contadores em zero real, fila e estados vazios elegantes.

### File List
Criados:
- `src/lib/activityClient.ts`
- `src/app/api/comando/route.ts`
Modificados:
- `src/app/comando/page.tsx` (cockpit: placar, fila, alertas)
- `src/app/disparo/page.tsx` (registra whatsapp_sent no clique)
- `src/app/pipeline/page.tsx` (registra whatsapp_sent no clique do WhatsApp do modal)

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir do pedido do Erick (sistema cobrando inputs diarios) e do Parecer Tallis (30 disparos/dia, regra dos 7 dias, regra do dia 20).
- 2026-07-08: Dex (@dev) implementou o cockpit de cobranca diaria: registro de whatsapp_sent no clique (disparo + pipeline), rota /api/comando (placar/fila/alertas) e tela do Comando reconstruida. Lint + build PASS. Status -> Ready for Review.
