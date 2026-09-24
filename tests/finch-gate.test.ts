import assert from "node:assert/strict";
import test from "node:test";

import {
  avaliarGateFinchLead,
  avaliarGateFinchLote,
  horasUteisEntre,
  respostasQualificadasParadas,
} from "../src/lib/finchGate.mjs";
import { orcamentoHumanoDaOferta, ofertaDoLead } from "../src/lib/salesPlaybook.mjs";

const governante = {
  id: 10,
  company: "Metal Forte Usinagem Industrial",
  segment: "usinagem",
  is_icp: true,
  porte: "EPP",
  capital_social: 250_000,
  cnae_descricao: "Servicos de usinagem, tornearia e solda",
  site_url: "https://metalforte.example",
};
const estruturado = { ...governante, id: 11, site_url: null };

test("P3: oferta por tier (A sob medida, B R$1.000, micro Base Industrial)", () => {
  assert.equal(ofertaDoLead({ capacity_tier: "governante", offer_track: "projeto" })?.key, "projectOffer");
  assert.equal(ofertaDoLead({ capacity_tier: "estruturado", offer_track: "projeto" })?.key, "offer");
  assert.equal(ofertaDoLead({ capacity_tier: "micro", offer_track: "entrada" })?.key, "entryOffer");
  assert.equal(ofertaDoLead({ capacity_tier: "incerto", offer_track: "nenhuma" }), null);
  assert.equal(ofertaDoLead({ capacity_tier: "governante", offer_track: "projeto" })?.priceInMessage, false);
});

test("P7 criterio 5: teto de toques derivado de R$100/h, taxa 5% e margem 60%", () => {
  assert.equal(orcamentoHumanoDaOferta("offer")?.maxManualTouches, 7);
  assert.equal(orcamentoHumanoDaOferta("projectOffer")?.maxManualTouches, 11);
  assert.equal(orcamentoHumanoDaOferta("offer")?.custoMaximo, 380);
});

test("P7: lead elegivel passa; anti-ICP, bot e degrau sem proximo passo retem", () => {
  assert.equal(avaliarGateFinchLead(governante, { degrau: "msg1" }).aprovado, true);
  assert.equal(avaliarGateFinchLead({ ...governante, decision_access: "gatekeeper" }, { degrau: "msg1" }).aprovado, true, "gatekeeper encaminha");

  assert.equal(avaliarGateFinchLead({ ...governante, company: "Serralheria Boa Vista", points: 90 }).aprovado, false);
  const bot = avaliarGateFinchLead({ ...governante, decision_access: "bot" }, { degrau: "msg1" });
  assert.equal(bot.aprovado, false);
  assert.equal(bot.criterios.find((c) => c.id === "decisor")?.ok, false);
  assert.equal(avaliarGateFinchLead(governante, { degrau: "degrauInventado" }).aprovado, false);
});

test("P7: Tier A nunca le R$1.000 e Tier B nunca le a faixa do site", () => {
  const tierA = avaliarGateFinchLead(governante, { degrau: "tierAOferta", mensagem: "R$ 1.000 a página" });
  assert.equal(tierA.criterios.find((c) => c.id === "ofertaDoTier")?.ok, false);
  const tierB = avaliarGateFinchLead(estruturado, { degrau: "msg2", mensagem: "O projeto parte de R$ 1.800" });
  assert.equal(tierB.criterios.find((c) => c.id === "ofertaDoTier")?.ok, false);
  assert.equal(avaliarGateFinchLead(estruturado, { degrau: "msg2", mensagem: "R$ 1.000 a página" }).aprovado, true);
});

test("P7: custo humano acima do teto retem", () => {
  assert.equal(avaliarGateFinchLead(estruturado, { degrau: "msg2", toquesManuais: 7 }).aprovado, true);
  assert.equal(avaliarGateFinchLead(estruturado, { degrau: "msg2", toquesManuais: 8 }).aprovado, false);
});

test("horas uteis contam so seg-sex, 8h-18h de Brasilia", () => {
  // sexta 25/09/2026 17h (Brasilia) ate segunda 28/09 10h = 1h + 2h
  assert.equal(horasUteisEntre("2026-09-25T20:00:00.000Z", "2026-09-28T13:00:00.000Z"), 3);
  assert.equal(horasUteisEntre("2026-09-26T12:00:00.000Z", "2026-09-27T20:00:00.000Z"), 0, "fim de semana nao conta");
});

test("P7 criterio 7: resposta qualificada parada segura volume novo", () => {
  const agora = "2026-09-24T19:00:00.000Z"; // quinta 16h
  const deals = [
    { id: 1, company: "Parada", stage: "abordado", response_type: "humana", last_inbound_at: "2026-09-23T13:00:00.000Z", last_outbound_at: "2026-09-22T13:00:00.000Z" },
    { id: 2, company: "Respondida", stage: "abordado", response_type: "humana", last_inbound_at: "2026-09-23T13:00:00.000Z", last_outbound_at: "2026-09-23T14:00:00.000Z" },
    { id: 3, company: "Recente", stage: "proposal", response_type: null, last_inbound_at: "2026-09-24T17:30:00.000Z", last_outbound_at: null },
    { id: 4, company: "Bot", stage: "abordado", response_type: "bot", last_inbound_at: "2026-09-20T13:00:00.000Z", last_outbound_at: null },
    { id: 5, company: "Perdida", stage: "lost", response_type: "humana", last_inbound_at: "2026-09-20T13:00:00.000Z", last_outbound_at: null },
  ];
  assert.deepEqual(respostasQualificadasParadas(deals, agora).map((p: { id: number }) => p.id), [1]);
  const antiIcp = { id: 6, company: "Refrigeracao Santos", stage: "abordado", response_type: "humana", last_inbound_at: "2026-09-20T13:00:00.000Z", last_outbound_at: null };
  assert.deepEqual(respostasQualificadasParadas([antiIcp], agora), [], "resposta de anti-ICP em estagio frio nao e qualificada");
  assert.equal(respostasQualificadasParadas([{ ...antiIcp, stage: "proposal" }], agora).length, 1, "no fundo do funil a conversa vale mais que a regra");

  const lote = avaliarGateFinchLote({ deals, agoraIso: agora, pedido: { governante: 20, estruturado: 20 } });
  assert.equal(lote.aprovado, false);
  assert.equal(lote.criterios.find((c) => c.id === "respostasParadas")?.ok, false);
  assert.equal(avaliarGateFinchLote({ deals: deals.slice(1), agoraIso: agora, pedido: { governante: 20, estruturado: 20 } }).aprovado, true);
});

test("P7 criterio 8: volume acima do piloto ou kill disparado retem", () => {
  const semParadas = { deals: [], agoraIso: "2026-09-24T19:00:00.000Z" };
  assert.equal(avaliarGateFinchLote({ ...semParadas, pedido: { governante: 30 } }).aprovado, false);
  assert.equal(avaliarGateFinchLote({ ...semParadas, pedido: { governante: 30 }, pilotoAnterior: { tiers: { governante: { scale: true } } } }).aprovado, true);
  assert.equal(avaliarGateFinchLote({ ...semParadas, pedido: { estruturado: 10 }, pilotoAnterior: { tiers: { estruturado: { kill: true, killMotivo: "5 precos sem venda" } } } }).aprovado, false);
  assert.equal(avaliarGateFinchLote({ ...semParadas, pedido: { governante: 20 }, pilotoAnterior: { tiers: { governante: { pendentesClassificacao: 2 } } } }).aprovado, false);
});
