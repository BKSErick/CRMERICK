# Plano de Implementacao - Follow-up Operacional

## Tarefa 1 - Fixar o contrato com testes

**Arquivos:** `tests/followup-operations.test.ts`, `package.json`

Criar testes RED para classificacao, cadencias, secao da fila, prioridade manual,
normalizacao e variantes de telefone. Incluir o teste na suite padrao.

**Verificacao:** o novo teste falha por modulos/funcoes ainda inexistentes.

## Tarefa 2 - Implementar o dominio

**Arquivos:** `src/lib/followup.ts`, `src/lib/whatsappPhone.ts`

Implementar funcoes puras para classificacao, proxima acao e organizacao da fila,
alem da equivalencia segura de telefone brasileiro.

**Verificacao:** o teste direcionado passa.

## Tarefa 3 - Persistir o estado operacional

**Arquivos:** `src/lib/crmRecords.ts`, `scripts/migrations/20260730_followup_operations.sql`,
`scripts/supabase-schema.sql`, `src/app/api/deals/route.ts`

Adicionar campos retrocompativeis, indices e mapeamento de leitura/escrita.

**Verificacao:** typecheck e teste de mapeamento passam.

## Tarefa 4 - Sincronizar atividades e Uazapi

**Arquivos:** `src/app/api/activities/route.ts`,
`src/app/api/webhooks/uazapi/route.ts`

Unificar envios manuais/sincronizados, atualizar timestamps e classificar entradas
sem alterar etapa ou enviar mensagens.

**Verificacao:** testes do webhook e teste direcionado passam.

## Tarefa 5 - Expor a operacao por CLI

**Arquivos:** `scripts/followup-ops.mjs`, `package.json`

Criar comandos de listagem, classificacao e agendamento sobre a mesma fonte de
verdade, sem envio ou mudanca de etapa.

**Verificacao:** dry-run/listagem e validacao de argumentos passam.

## Tarefa 6 - Construir a fila e os badges

**Arquivos:** `src/app/disparo/page.tsx`, `src/app/pipeline/page.tsx`,
`src/styles/hub.css`, `src/styles/legacy-pipeline.css`

Exibir secoes operacionais, contexto, acoes rapidas e resumo nos cards.

**Verificacao:** lint, typecheck e build passam; smoke visual local.

## Tarefa 7 - Fechar e publicar

Aplicar migracao, concluir checklist/file list, rodar todos os gates, revisar diff,
commit, push por DevOps e confirmar deployment da Vercel.
