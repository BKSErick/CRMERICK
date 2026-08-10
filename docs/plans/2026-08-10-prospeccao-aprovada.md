# Plano de implementacao - Prospeccao aprovada

## Tarefa 1 - Regressao de paginacao

**Arquivos:** `tests/supabase-pagination.test.ts`, `scripts/lib/supabaseRest.mjs`

**Objetivo:** provar que 1.420 registros sao lidos em duas paginas e que erros
HTTP interrompem a fila.

**Verificacao:** teste RED por modulo ausente; GREEN com chamadas 0-999 e 1000-1999.

## Tarefa 2 - Consumidores da fila completa

**Arquivos:** `scripts/uazapi-send-batch.mjs`,
`scripts/uazapi-followup-batch.mjs`, `scripts/uazapi-check-numbers.mjs`

**Objetivo:** substituir leituras unicas de deals, contacts e activities pela
paginacao compartilhada; adicionar `--ids`/`--exclude-ids` e exportacao de manifest.

**Verificacao:** teste estatico impede regressao para `Range: 0-9999` nesses fluxos.

## Tarefa 3 - Gate de aprovacao

**Arquivos:** `src/lib/prospectingApproval.ts`,
`scripts/prepare-prospecting-day.mjs`, `scripts/approve-prospecting-day.mjs`,
`scripts/dispatch-approved-batch.mjs`, `scripts/prospeccao-aprovada.cmd`

**Objetivo:** manifests imutaveis, aprovacao ligada ao hash e consumo idempotente.

**Verificacao:** testes cobrem aprovacao ausente, hash divergente, consumo repetido,
meta acumulada 20/40 e limite diario.

## Tarefa 4 - Preparar dados

**Arquivo:** `scripts/generate-copies-db.mjs`

**Objetivo:** gerar copies de Sete Lagoas com `--go`, sem qualquer envio.

**Verificacao:** dry-run amostral, execucao e nova leitura mostrando copies presentes.

## Tarefa 5 - Agendar 11/08/2026

**Objetivo:** criar tarefas Windows para 09:05 e 14:05 apontando para o dispatcher.

**Verificacao:** consultar tarefas, argumentos, horario e estado; executar dispatcher
sem aprovacao e confirmar zero envio.

## Tarefa 6 - Fechamento

**Arquivos:** `package.json`, story e file list.

**Objetivo:** expor comandos de preparar/aprovar/verificar e fechar quality gates.

**Verificacao:** lint, typecheck, testes, build, diff check, commit e push.
