# Story 015 - Lab: calculadora reversa da meta + experimentos de prospeccao

## Status
Ready for Review

## Story
Como Erick, quero a aba Lab transformada em laboratorio da meta de R$15k/mes: uma calculadora reversa que traduz o gap da meta em atividade de prospeccao necessaria, e um registro de experimentos de abordagem com resultado, para eu saber O QUE fazer hoje e QUAL abordagem esta funcionando.

## Contexto
Decisoes do Erick (07/07/2026): Lab = calculadora reversa + experimentos, com base na meta da North Star (story-014). Medicao via Kanban/activities. Nenhum numero fabricado.

Referencias de negocio (vault):
- `Playbook_Busca_Leads_Webson_2026-07-07.md`: 942 deals, 868 prontos, scoring de prioridade (`npm run leads:search-playbook`), abordagem por consciencia/canal/segmento - os experimentos nascem dai (canal, script, segmento, nivel de consciencia).
- `Plano de Escala e Oferta Grand Slam (Hormozi style).md`: regra Hormozi "primeiro MAIS (volume), depois MELHOR (conversao), so entao NOVO" - o Lab e exatamente o painel de MAIS/MELHOR.

## Acceptance Criteria
- [x] Calculadora reversa na aba Lab, alimentada por `/api/north-star` (story-014): gap do mes + ticket medio (default observado dos ganhos, rotulado, editavel), taxas resposta/fechamento (default goals.json 15%/20%, editaveis), calcula fechamentos faltantes, conversas, disparos e ritmo por dia util restante.
- [x] Taxas observadas vs manuais distinguidas na UI: ticket rotulado "observado no mes" vs "estimativa sua"; taxas do calculo rotuladas "estimativa sua"; painel separado "Taxas observadas no mes (activities)" com as transicoes de funil reais - estimativa nunca aparece como dado real.
- [x] Registro de experimentos em tabela `experiments` (migration aditiva, RLS deny-by-default, acesso so via `/api/experiments` server-side): nome, hipotese, canal, segmento, referencia de script, status, resultado, datas.
- [x] CRUD completo na aba Lab (criar, editar, listar, excluir). Estado vazio elegante quando nao houver experimentos.
- [x] Vinculo experimento-deal fica FORA do v1 (anotacao no resultado basta); deixado como comentario de evolucao futura no `lab/page.tsx`.
- [x] Nenhum dado fabricado; `npm run build` e `npm run lint` passam; estados com e sem dados renderizam.

## Tasks / Subtasks
- [x] Migration aditiva `20260708_experiments.sql` (aplicada) + rota `/api/experiments` (GET/POST/PATCH/DELETE, service-role).
- [x] Reuso da agregacao da story-014 (`/api/north-star` ja expoe funnel do mes; taxas observadas derivadas no Lab).
- [x] UI da calculadora reversa (gap, ticket, fechamentos, conversas, disparos, ritmo/dia util; campos editaveis com rotulo de origem).
- [x] UI do registro de experimentos (form criar/editar + lista + excluir; status e resultado).
- [x] Build + lint + verificacao dos estados.

## Dependencias
- Depende da story-014 (agregacao da meta/ticket/taxas). Implementar em sequencia: 014 -> 015.

## Riscos
- Sem historico de activities suficiente no comeco, as taxas observadas serao instaveis: fallback manual resolve, com rotulo claro.
- Mais uma tabela e rotas: manter padrao service-role server-side para nao reabrir brecha de RLS.

## Dev Agent Record

### Agent Model Used
Dex via Claude

### Debug Log References
- Migration aplicada em PRODUCAO via `node scripts/apply-migration.mjs scripts/migrations/20260708_experiments.sql`: HTTP 201 (CREATE TABLE IF NOT EXISTS experiments + RLS enable + drop policy "Allow all").
- `npm run lint`: PASS (ajuste do `react-hooks/set-state-in-effect`: load inicial inline no useEffect; `loadExperiments` reservado para reload pos-CRUD).
- `npm run build`: PASS. `/api/experiments` dinamica (f); `/lab` prerenderizada como shell client (o).

### Completion Notes List
- Tabela `experiments` ADITIVA (IF NOT EXISTS), RLS deny-by-default (sem policy anon); toda operacao via `/api/experiments` service-role.
- `/api/experiments`: GET (lista desc), POST (cria), PATCH (edita, carimba updated_at), DELETE. Mapeia snake_case <-> camelCase (script_ref <-> scriptRef).
- Calculadora reversa reusa `/api/north-star`: gap + dias uteis restantes + ticket medio observado + funnel do mes. Modelo: fechamentos = ceil(gap/ticket); conversas = ceil(fechamentos/callToClose); disparos = ceil(conversas/responseRate); disparos/dia = ceil(disparos/dias uteis).
- Distincao honesta de origem: ticket "observado no mes" (se houver ganhos) vs "estimativa sua"; taxas do calculo rotuladas "estimativa sua" (default goals.json); painel "Taxas observadas no mes (activities)" mostra as transicoes reais do funil (ou aviso de dados insuficientes). Estimativa nunca vira dado real.
- CRUD de experimentos com estado vazio elegante; vinculo experimento-deal deixado como evolucao futura (comentario no arquivo).

### File List
Criados:
- `scripts/migrations/20260708_experiments.sql`
- `src/app/api/experiments/route.ts`
Modificados:
- `src/app/lab/page.tsx` (calculadora reversa + CRUD de experimentos)

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir das decisoes do Erick (calculadora reversa + experimentos, Kanban como fonte) e do Playbook Webson.
- 2026-07-08: Dex (@dev) implementou a calculadora reversa (reuso de /api/north-star) e o CRUD de experimentos (tabela experiments + /api/experiments). Migration aditiva aplicada. Lint + build PASS. Status -> Ready for Review.
