import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const nav = source("src/lib/navigation.ts");
const page = source("src/app/clientes/page.tsx");
const workspace = source("src/components/ClientWorkspace.tsx");
const clientWorkspace = workspace;
const carteira = source("src/app/carteira/page.tsx");
const route = source("src/app/api/clients/route.ts");
const demandsPage = source("src/app/demandas/page.tsx");
const demandsRoute = source("src/app/api/demands/route.ts");
const demandWorkspace = source("src/components/DemandWorkspace.tsx");
const overview = source("src/components/DemandOverview.tsx");
const css = source("src/app/globals.css");

test("Clientes entra na navegacao e a Carteira sai da barra", () => {
  assert.match(nav, /label:\s*"Clientes"[\s\S]*href:\s*"\/clientes"[\s\S]*group:\s*"Gestao"/);
  assert.match(nav, /label:\s*"Carteira"[\s\S]*sidebar:\s*false/);
  assert.match(carteira, /redirect\("\/clientes"\)/);
});

test("aba Clientes lista, filtra, soma o mes e cadastra na mao", () => {
  assert.match(page, /Novo cliente/);
  assert.match(page, /type="month"/);
  assert.match(page, /formatDemandCurrency/);
  assert.match(page, /Recorrente \/ mes/);
  assert.match(page, /CNPJ/);
  assert.match(page, /ClientWorkspace/);
  // A lista vem da rota real, nao de JSON commitado.
  assert.match(page, /\/api\/clients\?month=/);
});

test("painel do cliente edita cadastro fiscal e mostra as demandas dele", () => {
  assert.match(workspace, /Razao social/);
  assert.match(workspace, /Inscricao estadual/);
  assert.match(workspace, /Valor em/);
  assert.match(workspace, /demandBillsInMonth/);
  assert.match(workspace, /\/demandas\?demandId=/);
});

test("rota de clientes sincroniza deal ganho e valida CNPJ", () => {
  assert.match(route, /syncClientsFromWonDeals/);
  // Importar a Carteira antiga e acao pedida, nunca automatica: senao cliente apagado voltaria.
  assert.match(route, /importCarteira/);
  assert.match(route, /isValidCnpj|cnpjColumn/);
  assert.match(route, /requireDemandAdminSession\(request, "clientes"\)/);
  // Cliente com demanda nao pode ser apagado: o historico de cobranca iria junto.
  assert.match(route, /Marque como Encerrado/);
});

test("demanda nasce ligada ao cliente, com valor e competencia", () => {
  assert.match(demandsPage, /clientId/);
  assert.match(demandsPage, /Valor \(R\$\)/);
  assert.match(demandsPage, /billingType/);
  assert.match(demandsPage, /billingMonth/);
  assert.match(demandsPage, /\/api\/clients/);
  assert.match(demandsRoute, /resolveDemandOwner/);
  assert.match(demandsRoute, /parseDemandValue/);
});

test("workspace da demanda edita cobranca e a lista mostra o valor", () => {
  assert.match(demandWorkspace, /Mes de cobranca/);
  assert.match(demandWorkspace, /billingUntil/);
  assert.match(overview, /Valor/);
  assert.match(overview, /formatDemandCurrency/);
  assert.match(css, /\.demand-cell-value/);
  assert.match(css, /\.client-totals/);
});

test("parcelamento tem geracao, edicao por parcela e baixa de pagamento", () => {
  const charges = source("src/app/api/demands/charges/route.ts");
  assert.match(charges, /buildInstallments/);
  assert.match(charges, /assertDemandWritable/);
  // Marcar pago carimba a data; desmarcar volta para nulo.
  assert.match(charges, /paid_at/);
  assert.match(demandWorkspace, /Marcar pago/);
  assert.match(demandWorkspace, /\/api\/demands\/charges/);
  // Sair do parcelado limpa as parcelas: senao elas seguiriam somando no mes. Quem
  // apaga e a RPC, na mesma transacao do update da demanda.
  assert.match(demandsRoute, /applyDemandUpdate/);
  assert.match(
    source("scripts/migrations/20260901_demandas_atomicas.sql"),
    /delete from public\.client_demand_charges where demand_id = p_demand_id/i,
  );
  assert.match(demandsPage, /Parcelas/);
  assert.match(css, /\.demand-installment-row/);
});

test("pontual e mensal tambem dao baixa, por mes", () => {
  const charges = source("src/app/api/demands/charges/route.ts");
  // A baixa por mes cria a cobranca na hora; desfazer apaga a linha.
  assert.match(charges, /toggleMonth/);
  assert.match(charges, /de baixa na parcela, nao no mes/);
  assert.match(demandWorkspace, /toggleMonthPaid/);
  assert.match(demandWorkspace, /recurringMonthsUntil/);
  assert.match(demandWorkspace, /Pagamento/);
  assert.match(clientWorkspace, /monthPaidValue/);
});
