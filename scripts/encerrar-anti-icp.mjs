/**
 * Encerra a cadencia dos anti-ICP (Story 066, P4 do checklist de 24/09/2026).
 *
 * Deal em abordado/followup que a regua marca como anti-ICP (ou is_icp=false) vai para
 * lost com loss_reason_code=no_fit e blocker=fora_icp, e ganha uma atividade stage_change
 * com o motivo. Excecao manual valida (approve-eligibility-exception.mjs) segura o deal.
 * Quem tem resposta humana esperando NAO e encerrado sozinho: sai numa lista para o Erick
 * responder (carta naoForaIcp) ou encerrar, porque resposta nunca some sem ninguem ver.
 * Tambem vai para revisao, e nao para lost, o que a regua pode ter errado: CNAE industrial
 * com palavra anti-ICP no nome (ex.: "Reforma de industrial" numa fabrica de estrutura
 * metalica) e is_icp=false da regra sem nenhum anti-ICP explicito (ex.: CNAE de manutencao
 * de maquina para metalurgia). Para esses, o caminho e approve-eligibility-exception.mjs.
 * Dry-run por padrao; --go grava. Nao envia mensagem.
 *
 *   node scripts/encerrar-anti-icp.mjs
 *   node scripts/encerrar-anti-icp.mjs --go
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { avaliarElegibilidadeProspeccao } from "../src/lib/prospectingEligibility.mjs";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);
const GO = process.argv.includes("--go");
const db = clienteSupabase();

const campos = "id,company,name,stage,segment,segment_norm,is_icp,porte,capital_social,cnae_descricao,site_url,decisor_nome,decision_access,eligibility_exception,is_prospect,last_inbound_at,last_outbound_at,response_type";
const deals = await db.get(`deals?stage=in.(abordado,followup)&select=${campos}`);

const CNAE_INDUSTRIAL = /fabrica[çc][aã]o|manuten[çc][aã]o e repara[çc][aã]o de m[aá]quinas|usinag|caldeirar|metal[uú]rg|tornearia/i;
// CNAE de serralheria, esquadria ou eletrodomestico e o proprio anti-ICP do checklist (JL e
// MP Serralheria bloqueadas): "Fabricacao" ali nao faz a empresa industrial.
const CNAE_ANTI = /serralheria|esquadria|eletrodom/i;
const NOME_INDUSTRIAL = /industri|usinag|caldeirar|metal[uú]rg|montagem industrial|equipamentos industriais/i;
const REGEX_ANTI = /anti-ICP/i;

const encerrar = [];
const comResposta = [];
const revisar = [];
for (const deal of deals) {
  if (deal.segment === "eventos" || deal.is_prospect === false) continue;
  const avaliacao = avaliarElegibilidadeProspeccao(deal);
  const antiIcp = deal.is_icp === false || /anti-ICP/i.test(avaliacao.eligibility_reason);
  if (avaliacao.eligible || !antiIcp) continue;
  const inbound = Date.parse(deal.last_inbound_at ?? "");
  const outbound = Date.parse(deal.last_outbound_at ?? "");
  const esperando = Number.isFinite(inbound) && (!Number.isFinite(outbound) || inbound > outbound) && deal.response_type !== "bot";
  const antiExplicito = REGEX_ANTI.test(avaliacao.eligibility_reason);
  const cnae = String(deal.cnae_descricao ?? "");
  const cnaeIndustrial = CNAE_INDUSTRIAL.test(cnae) && !CNAE_ANTI.test(cnae);
  const nomeIndustrial = NOME_INDUSTRIAL.test(String(deal.company ?? ""));
  if (esperando) comResposta.push({ deal, motivo: avaliacao.eligibility_reason });
  else if (!antiExplicito || cnaeIndustrial || nomeIndustrial) {
    revisar.push({ deal, motivo: cnaeIndustrial ? `CNAE industrial: ${cnae}` : nomeIndustrial ? `nome industrial; ${avaliacao.eligibility_reason}` : avaliacao.eligibility_reason });
  } else encerrar.push({ deal, motivo: avaliacao.eligibility_reason });
}

console.log(`Anti-ICP em cadencia (abordado/followup): ${encerrar.length + comResposta.length + revisar.length}`);
console.log(`  encerrar como lost/no_fit: ${encerrar.length}`);
for (const { deal, motivo } of encerrar.slice(0, 25)) {
  console.log(`   #${deal.id} ${String(deal.company || deal.name).slice(0, 60)} [${deal.stage}] ${motivo}`);
}
if (encerrar.length > 25) console.log(`   ... e mais ${encerrar.length - 25}`);
console.log(`  revisar (a regua pode ter errado; excecao manual se for industrial): ${revisar.length}`);
for (const { deal, motivo } of revisar) console.log(`   #${deal.id} ${String(deal.company || deal.name).slice(0, 60)} [${deal.stage}] ${motivo}`);
console.log(`  com resposta humana esperando (Erick decide, carta naoForaIcp): ${comResposta.length}`);
for (const { deal } of comResposta) console.log(`   #${deal.id} ${String(deal.company || deal.name).slice(0, 60)} [${deal.stage}]`);

if (!GO) {
  console.log("\nDRY-RUN. Nada gravado. Rode com --go para encerrar.");
  process.exit(0);
}

let feitos = 0;
for (const { deal, motivo } of encerrar) {
  await db.patch(`deals?id=eq.${deal.id}`, { stage: "lost", loss_reason_code: "no_fit", blocker: "fora_icp" });
  const atividade = await fetch(`${process.env.SUPABASE_URL}/rest/v1/activities`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      deal_id: deal.id,
      type: "stage_change",
      description: `${deal.company || deal.name} -> lost: cadencia encerrada, anti-ICP (${motivo}). P4, 24/09/2026.`,
    }),
  });
  if (!atividade.ok) console.error(`   #${deal.id}: encerrado, mas a atividade nao gravou (${atividade.status}).`);
  feitos += 1;
}
console.log(`\nOK: ${feitos} deals encerrados como lost/no_fit.`);
