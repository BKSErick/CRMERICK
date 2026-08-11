# Plano de implementacao - Story 029

## 1. Dominio e testes RED

**Arquivos:** `tests/deal-qualification.test.ts`, `src/lib/dealQualification.mjs`

Definir campos, normalizacao, completude, mutacoes e parser de sugestoes. Provar
primeiro os estados legado, sugerido, confirmado, corrigido e limpo.

**Verificacao:** teste focado deve falhar por modulo ausente antes da implementacao.

## 2. Persistencia, schema e CLI

**Arquivos:** `src/lib/dealQualificationService.mjs`, declaracoes `.d.mts`,
`scripts/deal-qualification.mjs`, migration, schema e `package.json`.

Persistir documento validado, atividade e evento comercial; expor consulta CLI
read-only por padrao, com filtro de pendencias.

**Verificacao:** testes de precedencia manual, auditoria e contratos estaticos.

## 3. APIs e eventos

**Arquivos:** `src/app/api/deals/route.ts`, `src/app/api/ai/route.ts`,
`src/lib/commercialAutomation.mjs`, `src/lib/crmRecords.ts`.

Adicionar mutacao manual no endpoint existente e sugestao estruturada no provider
existente, sem endpoint ou rota nova.

**Verificacao:** validação de payload, IA sem confirmacao e evento seguro.

## 4. Pipeline e Sala de Comando

**Arquivos:** `src/app/pipeline/page.tsx`, `src/app/api/comando/route.ts`,
`src/app/comando/page.tsx`.

Adicionar editor no overlay e destacar lacunas na fila existente somente nas
fases compativeis.

**Verificacao:** testes estaticos de UI e build sem rota nova.

## 5. Fechamento

Executar teste focado, lint, typecheck, suíte completa, build, revisao estatica,
CodeRabbit quando disponivel e atualizar somente as secoes permitidas da story.
