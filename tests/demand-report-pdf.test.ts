import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { type ClientDemand } from "../src/lib/clientDemands.ts";
import { buildDemandReport } from "../src/lib/demandReport.ts";
import { renderDemandReportPdf } from "../src/lib/demandReportPdf.ts";

function delivered(id: number, title: string, value: number): ClientDemand {
  return {
    id,
    dealId: 1,
    clientId: 1,
    folderId: null,
    title,
    description: "",
    copyText: "",
    status: "done",
    priority: "normal",
    assignee: "Erick",
    destinationType: "other",
    destinationLabel: "",
    value,
    billingType: "one_off",
    billingMonth: "2026-08",
    billingUntil: null,
    charges: [],
    startsAt: null,
    dueAt: "2026-08-20T23:59:59.000Z",
    completedAt: "2026-08-20T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    client: null,
    deal: { id: 1, company: "BFT" },
    checklistItems: [],
    links: [],
    attachments: [],
    events: [],
  };
}

const CLIENT = {
  name: "BFT Foods",
  legalName: "BFT Comercio de Alimentos LTDA",
  cnpj: "11222333000181",
  city: "Joao Monlevade",
  state: "MG",
};

test("relatorio de entregas vira PDF A4 nao vazio", async () => {
  const report = buildDemandReport(
    [delivered(1, "Video 02 Siavs", 115), delivered(2, "Post do evento", 50)],
    { month: "2026-08" },
    new Date("2026-08-31T15:00:00-03:00"),
  );

  const pdf = await renderDemandReportPdf(report, CLIENT);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 5000, `PDF pequeno demais: ${pdf.length} bytes`);
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  assert.ok(pageCount >= 1 && pageCount <= 3, `PDF criou ${pageCount} paginas para duas entregas`);
});

test("lista longa quebra em varias paginas em vez de vazar para fora da folha", async () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    delivered(index + 1, `Entrega numero ${index + 1} com titulo bem comprido para forcar quebra`, 50));
  const report = buildDemandReport(many, { month: "2026-08" }, new Date("2026-08-31T15:00:00-03:00"));
  assert.equal(report.totals.count, 60);

  const pdf = await renderDemandReportPdf(report, CLIENT);
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  assert.ok(pageCount > 1, "60 entregas deveriam passar de uma pagina");
});

test("periodo sem entrega ainda gera o documento, com aviso no lugar da tabela", async () => {
  const report = buildDemandReport([], { month: "2026-08" }, new Date("2026-08-31T15:00:00-03:00"));
  assert.equal(report.totals.count, 0);
  const pdf = await renderDemandReportPdf(report, CLIENT);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
});

test("renderizador segue o molde do contrato: logo da marca, paginacao e quebra segura", () => {
  const renderer = readFileSync(new URL("../src/lib/demandReportPdf.ts", import.meta.url), "utf8");
  assert.match(renderer, /mydrion-contract\.png/);
  assert.match(renderer, /ensurePdfSpace/);
  assert.match(renderer, /bufferedPageRange/);
  assert.match(renderer, /lineBreak: false/);
  // Os tres numeros que fecham a cobranca precisam existir no documento.
  assert.match(renderer, /Total entregue/);
  assert.match(renderer, /Ja pago/);
  assert.match(renderer, /A cobrar/);
});
