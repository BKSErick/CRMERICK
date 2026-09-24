/**
 * Materializa no CRM a regua calculada por prospectingEligibility.mjs.
 * Dry-run por padrao; --go grava. Nao envia mensagem, nao muda estagio e nao
 * reordena manifesto aprovado.
 *
 * Uso:
 *   node scripts/classify-prospecting-eligibility.mjs
 *   node scripts/classify-prospecting-eligibility.mjs --go
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { avaliarElegibilidadeProspeccao } from "../src/lib/prospectingEligibility.mjs";
import { carregarEnv, clienteSupabase, ehProspect } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const GO = process.argv.includes("--go");
const arg = (nome, padrao) => {
  const valor = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return valor ? valor.slice(nome.length + 3) : padrao;
};
const LIMITE = Math.max(0, Number(arg("limit", 0)) || 0);
const db = clienteSupabase();

const iguais = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function emLotes(itens, tamanho, fn) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(fn));
    if (i > 0 && i % 500 === 0) console.log(`  ...${i}/${itens.length}`);
  }
}

const deals = await db.get(
  "deals?select=id,company,name,segment,segment_norm,is_icp,porte,capital_social,cnae_descricao,site_url,decisor_nome,is_prospect,capacity_tier,capacity_evidence,decision_access,offer_track,eligibility_reason,eligibility_exception",
);

const avaliados = deals
  .filter((deal) => deal.is_prospect !== false && ehProspect(deal.company, deal.name))
  .map((deal) => {
    const resultado = avaliarElegibilidadeProspeccao(deal);
    const patch = {
      capacity_tier: resultado.capacity_tier,
      capacity_evidence: resultado.capacity_evidence,
      decision_access: resultado.decision_access,
      offer_track: resultado.offer_track,
      eligibility_reason: resultado.eligibility_reason,
    };
    const mudou = Object.entries(patch).some(([chave, valor]) => !iguais(deal[chave], valor));
    return { deal, resultado, patch, mudou };
  });

const contagem = avaliados.reduce((acc, item) => {
  const chave = `${item.resultado.eligible ? "elegivel" : "retido"}/${item.resultado.capacity_tier}/${item.resultado.offer_track}`;
  acc[chave] = (acc[chave] ?? 0) + 1;
  return acc;
}, {});
const mudancas = avaliados.filter((item) => item.mudou).slice(0, LIMITE || undefined);

console.log(`Prospects avaliados: ${avaliados.length} | mudancas: ${mudancas.length} | modo: ${GO ? "GRAVANDO" : "dry-run"}`);
for (const [chave, total] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${chave.padEnd(34)} ${total}`);
}
for (const item of mudancas.slice(0, 20)) {
  console.log(`  #${item.deal.id} ${String(item.deal.company || item.deal.name).slice(0, 48)} -> ${item.resultado.eligibility_reason}`);
}
if (mudancas.length > 20) console.log(`  ... e mais ${mudancas.length - 20}`);

if (!GO) {
  console.log("Dry-run. Nenhum deal foi alterado.");
} else {
  await emLotes(mudancas, 10, (item) => db.patch(`deals?id=eq.${item.deal.id}`, item.patch));
  console.log(`OK: ${mudancas.length} deals materializados. Nenhuma mensagem foi enviada.`);
}
