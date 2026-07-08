# Story 014 - North Star: painel da meta R$15k/mes

## Status
Ready for Review

## Story
Como Erick, quero a aba North Star transformada no painel da minha meta de R$15.000/mes, alimentado pelos deals reais do CRM, para que eu abra a tela e saiba em segundos quanto falta, em que ritmo estou e o que o funil do mes esta dizendo.

## Contexto
Decisoes do Erick (07/07/2026, sessao com Orion):
- "Aba mind" = North Star. E a tela da metrica principal.
- Meta: R$15.000/mes. Fonte do valor: campo de valor preenchido no proprio deal ao fechar (flexivel: landing R$3k, implementacao R$10k, retainer etc.).
- Medicao do funil: Kanban como fonte. Mover deal de coluna = evento medido (tabela `activities` ja registra mudanca de stage desde a story-013).
- Regra de dados vigente: NENHUM numero fabricado. Sem dados = estado vazio elegante que ele popula usando o CRM.

Referencias de negocio (vault): `SaaS/CRM ERICK/Posicionamento/Plano de Escala e Oferta Grand Slam (Hormozi style).md` (pricing: implementacao >= R$10k, recorrencia R$1,5-3k/mes) e `Erick Sena/Playbook_Busca_Leads_Webson_2026-07-07.md` (volume: 942 deals, 868 prontos para disparo, priority_score).

Estado tecnico: North Star acabou de ser portada para React nativo (story-012). Persistencia real via `/api/deals` (story-007). `activities` grava mudancas de stage (story-013).

## Acceptance Criteria
- [x] Deal possui campo de valor monetario editavel pela UI (modal do deal): coluna `value` ja existia; migration aditiva `20260708_north_star_deal_fields.sql` adicionou `recurring` e `closed_at` (ADD COLUMN IF NOT EXISTS), sem quebrar dados existentes.
- [x] E possivel identificar QUANDO um deal foi ganho: coluna `closed_at timestamptz` carimbada server-side quando o deal move para "won" (rota `/api/deals` PATCH), para agrupar receita por mes.
- [x] A aba North Star exibe, com dados reais do Supabase via rota server-side `/api/north-star`: meta do mes, realizado, gap, percentual, projecao run-rate, ticket medio e numero de fechamentos no mes.
- [x] Curva de metas em `content/goals.json` (editavel sem deploy): 2026-08: 9000, 2026-09: 13000, 2026-10: 7500, 2026-11: 15000; meses seguintes +10% sobre o anterior (composto). A tela mostra quebra dia/semana/mes/ano: meta do mes, meta da semana (mes/4), ritmo por dia util restante e visao do ano (curva + realizado por mes).
- [x] MRR visivel: campo `recurring boolean` (migration aditiva); painel mostra linha "MRR ativo" (soma dos recorrentes ganhos) separada do one-off, com piso do plano (R$4k em outubro).
- [x] Funil do mes derivado dos eventos `stage_change` em `activities` (entradas por etapa no mes). Etapas sem evento = zero real.
- [x] Mes sem dados = estados vazios elegantes ("nenhum fechamento ainda este mes"), zero numero fabricado, zero MRR fake.
- [x] Nada novo exposto client-side: agregacoes via rota server-side (service-role), no padrao 007/013.
- [x] `npm run build` e `npm run lint` passam; verificacao com e sem dados (estado vazio renderiza).

## Tasks / Subtasks
- [x] Inspecionar schema atual de `deals` (value ja existe; faltavam recurring/closed_at) antes de criar migration.
- [x] Migration aditiva (`recurring boolean`, `closed_at timestamptz`) aplicada via `scripts/apply-migration.mjs` + `/api/deals` (mappers + carimbo de closed_at no won).
- [x] UI: campo de valor + toggle recorrente no modal do deal (salva via `updateDeal`).
- [x] Rota server-side de agregacao `/api/north-star` (lib `metrics.ts`): realizado, fechamentos, ticket medio, run-rate, funil por stage do mes, MRR, visao do ano.
- [x] Reconstruir a tela North Star consumindo a rota: hero da meta, quebra dia/semana/mes/ano, funil, visao do ano e lista dos ganhos do mes.
- [x] Config da meta (curva + default 15000) editavel sem deploy em `content/goals.json`.
- [x] Build + lint + verificacao dos estados (com e sem dados).

## Dependencias
- story-012 (port React da North Star) e story-013 (activities em mudanca de stage): CONCLUIDAS (Ready for Review). Esta story constroi por cima.
- story-015 (Lab) consome a mesma rota de agregacao: construir a rota pensando em reuso.

## Riscos
- Migration em Supabase de producao: aditiva apenas (ADD COLUMN), nunca destrutiva; dry-run antes se possivel.
- Deals ganhos historicos podem nao ter valor preenchido: tratar como "sem valor informado" (visivel na lista para o Erick preencher), nao como zero silencioso.
- Definicao de "ganho" depende do nome real do stage no Kanban: mapear pelo que existe, nao assumir.

## Dev Agent Record

### Agent Model Used
Dex via Claude

### Debug Log References
- Migration aplicada em PRODUCAO (ref rezgkabwxxltpprpvdua) via `node scripts/apply-migration.mjs scripts/migrations/20260708_north_star_deal_fields.sql`: HTTP 201 (ADD COLUMN IF NOT EXISTS recurring, closed_at).
- `npm run lint`: PASS, zero warnings.
- `npm run build`: PASS. `/api/north-star` registrada dinamica (f); north-star prerenderizada como shell client (o); TypeScript OK.

### Completion Notes List
- Migration ADITIVA apenas (IF NOT EXISTS): `recurring boolean default false` + `closed_at timestamptz`. `value numeric` ja existia. Nada destrutivo no Supabase de producao.
- `closed_at` carimbado server-side no PATCH de `/api/deals` quando o stage vira "won" (se ainda nao informado) - permite atribuir receita ao mes correto.
- Lib server-only `src/lib/metrics.ts` (`computeNorthStar`): realizado do mes (won com closed_at no mes e value>0), gap, %, run-rate (projecao por dias uteis), ticket medio, MRR ativo (recorrentes ganhos), funil do mes (via `activities` stage_change), visao do ano (curva + realizado por mes). Reutilizavel por Lab (015) e Comando (016).
- Curva de metas + premissas em `content/goals.json` (editavel sem deploy). `targetForMonth`: mes definido -> valor; apos o ultimo -> +10% composto; antes do primeiro -> defaultTarget 15000.
- North Star reconstruida como client component consumindo `/api/north-star`: hero (meta/realizado/gap/projecao + barra), quebra semana/dia util, MRR + piso, funil do mes, visao do ano, tabela de ganhos (marca "sem valor informado"/"sem data" para o Erick completar). Estados vazios honestos.
- Modal do deal: campo "Valor do deal (R$)" + checkbox "Recorrente (MRR)" salvando via `updateDeal`.
- Regra de dados respeitada: zero numero fabricado; sem fonte real = estado vazio.

### File List
Criados:
- `content/goals.json`
- `scripts/migrations/20260708_north_star_deal_fields.sql`
- `src/lib/metrics.ts`
- `src/app/api/north-star/route.ts`
Modificados:
- `src/lib/crmRecords.ts` (campos recurring/closedAt nos mappers)
- `src/app/api/deals/route.ts` (carimbo closed_at no won)
- `src/app/north-star/page.tsx` (painel da meta, client)
- `src/app/pipeline/page.tsx` (editor de valor + recorrente no modal)

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir das decisoes do Erick na sessao (meta 15k, valor no deal, Kanban como fonte) e do Plano Grand Slam do vault.
- 2026-07-08: Dex (@dev) implementou o painel da meta: migration aditiva (recurring/closed_at) aplicada em producao, lib metrics + rota /api/north-star, curva em goals.json, tela reconstruida e editor de valor/recorrente no modal. Lint + build PASS. Status -> Ready for Review.
