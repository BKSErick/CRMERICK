# Plano de implementacao - Contratos dentro de Clientes

## Tarefa 1 - Trancar o dominio com testes RED

**Arquivos:** `tests/client-contracts.test.ts`, `src/lib/clientContracts.ts`

**Objetivo:** definir as quatro chaves de template, campos, status, validacao,
formatacao monetaria, snapshots e transicoes permitidas.

**Contrato inicial:**

```ts
export type ContractTemplateKey =
  | "general_services"
  | "visual_identity"
  | "social_media"
  | "mydrion_technology";
export type ContractStatus = "draft" | "generated" | "sent" | "signed" | "cancelled";
export type ContractDraft = {
  clientId: number;
  templateKey: ContractTemplateKey;
  title: string;
  object: string;
  scope: string[];
  value: number;
  paymentTerms: string;
  startsOn: string | null;
  endsOn: string | null;
  signingCity: string;
  representativeName: string;
  representativeDocument: string;
};
```

**Verificacao:** `node --test tests/client-contracts.test.ts` falha sem o dominio e
passa com os quatro templates, limites, datas e transicoes testadas.

## Tarefa 2 - Criar persistencia aditiva

**Arquivos:** `scripts/migrations/20260829_client_contracts.sql`,
`scripts/supabase-schema.sql`, `tests/client-contracts-schema.test.ts`

**Objetivo:** adicionar representante ao cliente e tabela auditavel de contratos.

**Schema alvo:**

```sql
alter table public.clients
  add column if not exists representative_name text not null default '',
  add column if not exists representative_document text not null default '';

create table if not exists public.client_contracts (
  id bigint generated always as identity primary key,
  contract_number text not null unique,
  client_id bigint references public.clients(id) on delete set null,
  template_key text not null,
  template_version integer not null check (template_version > 0),
  status text not null default 'draft',
  title text not null,
  draft_payload jsonb not null,
  client_snapshot jsonb,
  provider_snapshot jsonb,
  document_snapshot jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Adicionar checks completos para template/status/JSON, indices por cliente e data,
RLS sem policy publica e trigger de `updated_at`. Criar funcao server-only para
alocar `CTR-AAAA-NNNN` com lock transacional.

**Verificacao:** teste de contrato confirma migration repetivel, RLS, constraints,
snapshots e schema consolidado sincronizado.

## Tarefa 3 - Atualizar o cadastro fiscal do cliente

**Arquivos:** `src/lib/clients.ts`, `src/app/api/clients/route.ts`,
`src/components/ClientWorkspace.tsx`, `tests/clients.test.ts`,
`tests/clients-ui.test.ts`

**Objetivo:** mapear, validar, salvar e editar nome/documento do representante.

**Verificacao:** testes provam round-trip dos campos e o painel exibe ambos sem
regredir CNPJ, cobranca ou demandas.

## Tarefa 4 - Implementar repositorio e API administrativa

**Arquivos:** `src/lib/clientContractsServer.ts`,
`src/app/api/client-contracts/route.ts`, `tests/client-contracts-routes.test.ts`

**Objetivo:** listar por cliente, criar rascunho, editar campos/status e congelar
snapshots ao gerar.

**Endpoints:**

```text
GET    /api/client-contracts?clientId=123
POST   /api/client-contracts
PATCH  /api/client-contracts?id=456
```

Todas as operacoes exigem `requireDemandAdminSession(request, "clientes")`.
`POST` busca o cliente no servidor e nunca aceita snapshot vindo do navegador.
`PATCH action=generate` valida os campos, monta o documento e grava os tres
snapshots atomicamente antes de retornar o contrato gerado.

**Verificacao:** teste cobre 401, 400, 404, criacao, edicao apenas em rascunho,
geracao e transicoes permitidas.

## Tarefa 5 - Renderizar documento e PDF Mydrion

**Arquivos:** `src/lib/contractDocument.ts`, `src/lib/contractProvider.ts`,
`src/components/ContractPdfDocument.tsx`,
`src/app/api/client-contracts/[id]/pdf/route.ts`,
`public/brand/mydrion-contract.svg`, `package.json`, `package-lock.json`,
`tests/client-contract-pdf.test.ts`

**Objetivo:** transformar somente snapshots persistidos em documento A4 e resposta
PDF. Adicionar `@react-pdf/renderer` como dependencia direta. A contratada usa os
dados oficiais dos comprovantes; `Mydrion` aparece como marca.

**Resposta alvo:**

```ts
return new Response(pdfBytes, {
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
    "Cache-Control": "private, no-store",
  },
});
```

**Verificacao:** PDF com assinatura `%PDF`, tamanho nao vazio, cabecalho Mydrion,
numero do contrato e texto extraido do snapshot; rota recusa rascunho e usuario sem
sessao.

## Tarefa 6 - Criar historico, formulario e previa no cliente

**Arquivos:** `src/components/ClientContracts.tsx`,
`src/components/ContractDialog.tsx`, `src/components/ContractPreview.tsx`,
`src/components/ClientWorkspace.tsx`, `src/app/globals.css`,
`tests/client-contracts-ui.test.ts`

**Objetivo:** incluir a secao Contratos no workspace, wizard dos quatro modelos,
alerta de dados ausentes, previa paginada, geracao/download e mudanca manual de
status.

**Verificacao:** teste exige os quatro modelos, valor, escopo, previa, estados,
download e mensagens de erro. Smoke visual cobre desktop e viewport estreito.

## Tarefa 7 - Fechar a story e gates

**Arquivos:** `package.json`, `docs/stories/story-043-contratos-clientes.md`

**Objetivo:** incluir os novos testes no gate padrao, marcar ACs somente depois da
evidencia e atualizar File List/migrations.

**Verificacao:**

```text
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Migration/deploy, commit e push permanecem separados e dependem de autorizacao
explicita; validacao local nao e evidencia de producao.
