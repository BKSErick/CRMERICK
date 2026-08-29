# Story 043 - Contratos dentro de Clientes

**Status:** Ready for Review
**Data:** 2026-08-29
**Origem:** pedido direto do Erick para gerar contratos a partir do cadastro do cliente.

## Contexto

O CRM ja centraliza dados fiscais, demandas e valores por cliente, mas a criacao de
contrato ainda depende de DOCX antigos, preenchimento manual e informacoes espalhadas.
O operador precisa selecionar cliente, servico e valor, revisar o documento e gerar um
PDF Mydrion preservado no historico.

## Acceptance Criteria

- [x] Contratos aparece dentro do workspace do cliente, com historico e novo rascunho.
- [x] Catalogo inicial possui exatamente: geral, identidade visual, redes sociais e
      site/sistema/automacao Mydrion.
- [x] Cliente fornece automaticamente razao social, CNPJ, endereco, contato e
      representante; ausencias ficam visiveis antes da geracao.
- [x] Formulario aceita objeto, escopo, valor, pagamento, vigencia, cidade e data.
- [x] Previa editavel apresenta o documento completo antes do PDF.
- [x] PDF A4 usa a logo Mydrion e identifica a contratada pelos dados juridicos oficiais.
- [x] Contrato gerado congela snapshots e nao muda quando cliente/template forem editados.
- [x] Numero `CTR-AAAA-NNNN` e unico e alocado sem colisao.
- [x] Status suportados: Rascunho, Gerado, Enviado, Assinado e Cancelado, com transicoes
      validadas.
- [x] Rotas e PDF exigem sessao administrativa e tabelas mantem RLS sem acesso publico.
- [x] Modelos antigos servem apenas de referencia; dados bancarios antigos nao entram por
      default e o texto novo registra pendencia de revisao juridica antes do uso externo.
- [x] Testes cobrem dominio, schema, API, UI e PDF; lint, typecheck, suite e build passam.

## Fora do escopo

- Assinatura eletronica, envio automatico, cobranca, editor livre de clausulas e
  importacao de contratos historicos.

## File List

- [x] `docs/plans/2026-08-29-contratos-clientes-design.md`
- [x] `docs/plans/2026-08-29-contratos-clientes-implementation.md`
- [x] `docs/stories/story-043-contratos-clientes.md`
- [x] `scripts/migrations/20260829_client_contracts.sql`
- [x] `scripts/verify-20260829-client-contracts.mjs`
- [x] `scripts/supabase-schema.sql`
- [x] `src/lib/clientContracts.ts`, `src/lib/clientContractsServer.ts`
- [x] `src/lib/contractProvider.ts`, `src/lib/contractPdf.ts`
- [x] `src/app/api/client-contracts/route.ts`, `src/app/api/client-contracts/[id]/pdf/route.ts`
- [x] `src/components/ClientContracts.tsx`, `src/components/ContractDialog.tsx`
- [x] `src/components/ContractPreview.tsx`, `src/components/ClientWorkspace.tsx`
- [x] `src/lib/clients.ts`, `src/lib/clientsServer.ts`, `src/app/api/clients/route.ts`
- [x] `src/app/globals.css`, `public/brand/mydrion-contract.svg`, `public/brand/mydrion-contract.png`
- [x] `package.json`
- [x] `tests/client-contracts.test.ts`, `tests/client-contracts-schema.test.ts`
- [x] `tests/client-contracts-routes.test.ts`, `tests/client-contracts-ui.test.ts`
- [x] `tests/client-contract-pdf.test.ts`

## Evidencia local

- `npm run lint`: verde.
- `npm run typecheck`: verde.
- `npm test`: 347/347 verdes.
- `npm run build`: verde; rotas `/api/client-contracts` e
  `/api/client-contracts/[id]/pdf` presentes no manifesto.
- Smoke visual: PDF Mydrion A4 em duas paginas, sem coluna estreita, paginas extras ou
  titulo de secao orfao; regressao coberta por teste.
- `git diff --check`: verde.

## Pendencias de rollout

- Migration aplicada no Supabase em 2026-08-29 apos dry-run com `ROLLBACK` (HTTP 201).
  Verificacao remota confirmou campos, tabelas, funcao de numeracao, RLS habilitada e
  ausencia de policies/grants diretos para `anon` e `authenticated`.
- Nenhum deploy/commit/push foi executado.
- Clausulas-base precisam de revisao juridica antes do primeiro contrato externo.
