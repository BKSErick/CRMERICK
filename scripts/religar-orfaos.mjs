/**
 * Religa threads orfas (Story 066, P4 do checklist de 24/09/2026).
 *
 * Deal orfao e o "WhatsApp NNNN" que o webhook cria quando chega mensagem de um numero
 * que ele nao achou no CRM (ehOrfao, scripts/lib/analise-comum.mjs). A conversa fica
 * separada do deal da empresa e some das filas e dos relatorios dela.
 *
 * Religa SO quando o telefone bate com UM deal de empresa (deal ou contato, com e sem o
 * nono digito, via phoneMatchVariants): mensagens e atividades passam para o deal certo e
 * o orfao sai da prospeccao (lost, is_prospect=false, blocker thread_religada). Numero sem
 * match ou com mais de um candidato fica listado para o Erick. Dry-run por padrao; --go
 * grava. Nao envia mensagem.
 *
 *   node scripts/religar-orfaos.mjs
 *   node scripts/religar-orfaos.mjs --go
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { phoneMatchVariants } from "../src/lib/whatsappPhone.ts";
import { carregarEnv, clienteSupabase, ehOrfao } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);
const GO = process.argv.includes("--go");
const db = clienteSupabase();

const [deals, contatos] = await Promise.all([
  db.get("deals?select=id,company,name,stage,phone,whatsapp,contact_id,is_prospect"),
  db.get("contacts?select=id,phone,whatsapp_site,whatsapp_jid"),
]);

const orfaos = deals.filter((deal) => ehOrfao(deal.company, deal.name));
const empresas = deals.filter((deal) => !ehOrfao(deal.company, deal.name));
const contatoPorId = new Map(contatos.map((contato) => [Number(contato.id), contato]));

/** Todos os telefones conhecidos de um deal de empresa (proprio, contato vinculado, contato de mesmo id). */
function telefonesDoDeal(deal) {
  const contato = contatoPorId.get(Number(deal.contact_id)) ?? contatoPorId.get(Number(deal.id));
  return [deal.phone, deal.whatsapp, contato?.phone, contato?.whatsapp_site, String(contato?.whatsapp_jid ?? "").split("@")[0]]
    .filter(Boolean)
    .flatMap((valor) => phoneMatchVariants(String(valor)));
}

const dealsPorTelefone = new Map();
for (const deal of empresas) {
  for (const variante of new Set(telefonesDoDeal(deal))) {
    if (!dealsPorTelefone.has(variante)) dealsPorTelefone.set(variante, new Set());
    dealsPorTelefone.get(variante).add(Number(deal.id));
  }
}

function numeroDoOrfao(orfao) {
  return orfao.phone || orfao.whatsapp || String(orfao.company || orfao.name || "").replace(/\D/g, "");
}

const religar = [];
const semMatch = [];
const ambiguos = [];
for (const orfao of orfaos) {
  const candidatos = new Set();
  for (const variante of phoneMatchVariants(numeroDoOrfao(orfao))) {
    for (const id of dealsPorTelefone.get(variante) ?? []) candidatos.add(id);
  }
  const lista = [...candidatos];
  if (lista.length === 1) religar.push({ orfao, alvo: empresas.find((deal) => Number(deal.id) === lista[0]) });
  else if (lista.length === 0) semMatch.push(orfao);
  else ambiguos.push({ orfao, lista });
}

console.log(`Threads orfas: ${orfaos.length}`);
console.log(`  religar (match unico por telefone): ${religar.length}`);
for (const { orfao, alvo } of religar) console.log(`   #${orfao.id} ${orfao.company || orfao.name} -> #${alvo.id} ${alvo.company} [${alvo.stage}]`);
console.log(`  mais de um candidato (Erick decide): ${ambiguos.length}`);
for (const { orfao, lista } of ambiguos) console.log(`   #${orfao.id} ${orfao.company || orfao.name} -> ${lista.map((id) => `#${id}`).join(", ")}`);
console.log(`  sem empresa no CRM com esse numero: ${semMatch.length}`);
for (const orfao of semMatch.slice(0, 40)) console.log(`   #${orfao.id} ${orfao.company || orfao.name} [${orfao.stage}]`);

if (!GO) {
  console.log("\nDRY-RUN. Nada gravado. Rode com --go para religar.");
  process.exit(0);
}

let feitos = 0;
for (const { orfao, alvo } of religar) {
  await db.patch(`messages?deal_id=eq.${orfao.id}`, { deal_id: alvo.id });
  await db.patch(`activities?deal_id=eq.${orfao.id}`, { deal_id: alvo.id });
  await db.patch(`deals?id=eq.${orfao.id}`, {
    stage: "lost",
    is_prospect: false,
    blocker: "thread_religada",
    description: `Thread orfa religada ao deal #${alvo.id} (${alvo.company}) em ${new Date().toISOString().slice(0, 10)}.`,
  });
  feitos += 1;
}
console.log(`\nOK: ${feitos} threads religadas.`);
