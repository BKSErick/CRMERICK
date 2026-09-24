/**
 * Excecao manual da regua de prospeccao (Story 064, P0 do checklist de 24/09/2026).
 *
 * Unico caminho de escrita de deals.eligibility_exception. Serve para o falso positivo da
 * regua (ex.: nome com "serralheria" numa empresa que fabrica estrutura para mineradora):
 * libera o lead para a oferta principal SO com evidencia industrial escrita e aprovador.
 * Dry-run por padrao; --go grava. --revogar remove a excecao. Nao envia mensagem, nao muda
 * estagio e nao mexe em manifesto aprovado.
 *
 * Uso:
 *   node scripts/approve-eligibility-exception.mjs --id=1269 --tier=estruturado \
 *     --evidence="Fabrica estrutura metalica para mineradora (pedido Vale 2025)" --por=erick
 *   node scripts/approve-eligibility-exception.mjs --id=1269 ... --go
 *   node scripts/approve-eligibility-exception.mjs --id=1269 --revogar --go
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { avaliarElegibilidadeProspeccao, excecaoValida } from "../src/lib/prospectingEligibility.mjs";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);

const GO = process.argv.includes("--go");
const REVOGAR = process.argv.includes("--revogar");
const arg = (nome, padrao = "") => {
  const valor = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return valor ? valor.slice(nome.length + 3) : padrao;
};

const id = Number(arg("id"));
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe --id=<deal>.");
  process.exit(1);
}

const db = clienteSupabase();
const campos = "id,company,name,stage,segment,segment_norm,is_icp,porte,capital_social,cnae_descricao,site_url,decisor_nome,decision_access,eligibility_exception";
const [deal] = await db.get(`deals?id=eq.${id}&select=${campos}`);
if (!deal) {
  console.error(`Deal #${id} nao encontrado.`);
  process.exit(1);
}

const antes = avaliarElegibilidadeProspeccao(deal);
console.log(`#${deal.id} ${deal.company || deal.name} [${deal.stage}]`);
console.log(`  hoje: ${antes.eligible ? "ELEGIVEL" : "RETIDO"} (${antes.eligibility_reason})`);

let excecao = null;
if (!REVOGAR) {
  excecao = excecaoValida({
    evidence: arg("evidence"),
    tier: arg("tier"),
    approved_by: arg("por"),
    approved_at: new Date().toISOString(),
  });
  if (!excecao) {
    console.error("\nExcecao recusada: exige --evidence nao vazia, --tier=governante|estruturado e --por=<aprovador>.");
    process.exit(1);
  }
}

const depois = avaliarElegibilidadeProspeccao({ ...deal, eligibility_exception: excecao });
console.log(`  com a mudanca: ${depois.eligible ? "ELEGIVEL" : "RETIDO"} (${depois.eligibility_reason})`);

if (!GO) {
  console.log("\nDRY-RUN. Nada gravado. Rode com --go para aplicar.");
  process.exit(0);
}

await db.patch(`deals?id=eq.${id}`, {
  eligibility_exception: excecao,
  capacity_tier: depois.capacity_tier,
  capacity_evidence: depois.capacity_evidence,
  decision_access: depois.decision_access,
  offer_track: depois.offer_track,
  eligibility_reason: depois.eligibility_reason,
});
console.log(`\nOK: excecao ${REVOGAR ? "revogada" : "gravada"} no deal #${id}.`);
