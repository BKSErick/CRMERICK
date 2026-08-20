# Story 034 - Plano de implementação de Demandas

## Objetivo

Entregar a aba `/demandas` com lista operacional, múltiplas demandas por deal,
workspace detalhado, checklist, links, anexos privados e trilha de eventos, sem
acoplar o status da demanda ao Pipeline.

## Restrições

- Preservar as alterações locais anteriores do checkout.
- Não adicionar dependências npm.
- Não aplicar migration ou publicar sem validação separada.
- Usar Supabase somente no servidor, com sessão administrativa e RLS
  deny-by-default.
- Implementar em ciclos RED-GREEN-REFACTOR.

## Sequência executável

### 1. Contratos puros e testes RED

**Arquivos:** `tests/client-demands.test.ts`, `src/lib/clientDemands.ts`

Criar testes para elegibilidade de deal, agrupamento temporal em
`America/Sao_Paulo`, transições `done`/reabertura, progresso de checklist,
validação de URL e validação de anexo. Executar o teste e confirmar falha por
módulo ausente antes de implementar o contrato mínimo.

**Verificação:** `node --test tests/client-demands.test.ts`.

### 2. Contrato persistente e segurança

**Arquivos:** `scripts/migrations/20260820_client_demands.sql`,
`scripts/supabase-schema.sql`, `tests/demands-routes.test.ts`

Escrever primeiro testes estruturais para tabelas, constraints, FKs, índices,
RLS, bucket privado e rotas autenticadas. Criar migration aditiva e sincronizar
o schema consolidado.

**Verificação:** `node --test tests/demands-routes.test.ts` e diff entre migration
e schema para os contratos obrigatórios.

### 3. APIs server-side

**Arquivos:** `src/app/api/demands/**/route.ts`, `src/lib/demandAuth.ts`

Implementar CRUD paginado de demandas, validação de deal ganho, checklist,
links, eventos/comentários e fluxo de upload/download assinado. Todas as rotas
validam a sessão e retornam erros estruturados.

**Verificação:** testes de contrato das rotas, typecheck e lint direcionado.

### 4. Lista e workspace

**Arquivos:** `src/app/demandas/page.tsx`,
`src/components/DemandWorkspace.tsx`, `src/lib/navigation.ts`,
`src/app/globals.css`, `tests/demands-ui.test.ts`

Criar a lista agrupada, busca/filtros combináveis, criação rápida, deep link e
workspace com propriedades, descrição, copy, checklist, links, anexos,
comentários e atividade. A aba `Deal comercial` abre a superfície canônica do
Pipeline para evitar duplicação de regras.

**Verificação:** teste de contrato visual, teclado, mobile e build Next.js.

### 5. Regressão e fechamento

**Arquivos:** `package.json`, story 034 e File List.

Adicionar os testes ao comando oficial, executar lint, typecheck, suíte completa
e build. Revisar o diff, rodar CodeRabbit quando disponível e atualizar apenas
as seções autorizadas da story.

**Verificação:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
e `git diff --check`.
